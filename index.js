const {
  Client,
  GatewayIntentBits,
  InteractionType,
  ApplicationCommandOptionType,
  ChannelType
} = require('discord.js');
const fs = require('fs');

const {
  TOKEN,
  SERVER_DIR
} = require('./config.json');

const R_YES = "👍";
const R_NO = "👎";
const LIMIT_PAR = 50;

class App{
  constructor(){
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
      ]
    });
  }

  async start(){
    this.setup_discord();

    this.client.login(TOKEN);
  }

  setup_discord(){
    const command = [
      {
        name: "kill",
        description: "多数が殺したいなら殺してもいいよね！",
        options: [
          {
            type: ApplicationCommandOptionType.User,
            name: "target",
            description: "今回のターゲット",
            required: true
          }
        ]
      },
      {
        name: "sethell",
        description: "行き先",
        options: [
          {
            type: ApplicationCommandOptionType.Channel,
            name: "hell",
            channel_types: [ChannelType.GuildVoice],
            description: "末路",
            required: true
          }
        ]
      }
    ];

    this.client.on('ready', async () => {
      await this.client.application.commands.set(command);
    });

    this.client.on('interactionCreate', this.onInteraction.bind(this));
  }

  async onInteraction(interaction){
    if(!(interaction.isChatInputCommand())) return;
    if(!(interaction.inGuild())) return;


    try{
      switch(interaction.commandName){
        case "kill":
          await this.kill_command(interaction);
          break;
        case "sethell":
          await this.sethell_command(interaction);
          break;
        default:
          await interaction.reply("そんなコマンドないよ");
          breakl
      }
    }catch(e){
      console.log(e);
      try{
        await interaction.reply("そんなコマンドないよ");
      }catch(e){
        // 元がないときある
      }
    }
  }

  async kill_command(interaction){
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.member.id);
    const member_vc = member.voice.channel;

    if(!member_vc){
      await interaction.reply({ content: "VCに入ってからやってね" });
      return;
    }

    const target = interaction.options.get("target");
    const vc_users = member_vc.members;

    const vc_target_user = vc_users.get(target.value);

    if(!vc_target_user){
      await interaction.reply({ content: "もう死んでるよ" });
      return;
    }

    let to_channel;
    if(fs.existsSync(`${SERVER_DIR}/${guild.id}.json`)){
      try{
        const result = JSON.parse(fs.readFileSync(`${SERVER_DIR}/${guild.id}.json`));
        to_channel = result.hell;
        if(!to_channel) throw "ない";
      }catch(e){
        console.log(e);
        interaction.reply({ content: "先に行き先設定を済ませてね" });
        return;
      }
    }else{
      interaction.reply({ content: "先に行き先設定を済ませてね" });
      return;
    }

    await interaction.deferReply();

    const r_filter = (reaction, user) => {
      return (!!(vc_users.get(user.id)) && (reaction.emoji.name === R_YES));
    };

    let max_count = Math.floor(vc_users.size * (LIMIT_PAR / 100));
    if(max_count <= 0) max_count = 1;

    const count_message = await interaction.channel.send(`${vc_target_user.displayName}を移動させる？(VC内の${max_count}人のリアクションで実行)`);

    count_message.awaitReactions({ filter: r_filter, max: max_count, time: 100000, errors: ['time'] })
      .then(async () => {
        try{
          await count_message.delete();
          await vc_target_user.voice.setChannel(to_channel);
          await interaction.followUp('完了。');
        }catch(e){
          await interaction.followUp('移動に失敗した…');
          return;
        }

      })
      .catch(async () => {
        try{
          await count_message.delete();
          await interaction.followUp('実行されなかったよ');
        }catch(e){
          console.log(e);
        }
      });

    await count_message.react(R_YES);
    await count_message.react(R_NO);
  }

  async sethell_command(interaction){
    const guild = interaction.guild;
    if(!(interaction.member.permissions.has('Administrator'))){
      interaction.reply("管理者になって出直して");
      return;
    }

    const data = {
      hell: interaction.options.get("hell").value
    }
    try{
      fs.writeFileSync(`${SERVER_DIR}/${guild.id}.json`, JSON.stringify(data));
    }catch(e){
      console.log(e);
      return;
    }

    interaction.reply("セットしたよ");
  }
}

function main(){
  const app = new App();

  app.start();
}

main();
