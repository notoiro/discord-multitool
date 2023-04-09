const {
  Client,
  GatewayIntentBits,
  InteractionType,
  ApplicationCommandOptionType,
  ChannelType
} = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioResource,
  StreamType,
  createAudioPlayer,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
  AudioPlayerStatus
} = require("@discordjs/voice");
const fs = require('fs');
const dateformat = require('@matteo.collina/dateformat');

const {
  TOKEN,
  SERVER_DIR,
  VOICE_PATH
} = require('./config.json');

const sleep = waitTime => new Promise( resolve => setTimeout(resolve, waitTime) );

const R_YES = "👍";
const R_NO = "👎";
const LIMIT_PAR = 50;
const MAXCHOICE = 25;

const h_list = [
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
  "12", "13", "14", "15", " 16", "17", "18", "19", "20", "21", "22", "23"
];
const m_list = [
  "00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"
];

class App{
  constructor(){
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
      ]
    });
    this.alarm_list = new Map();
  }

  async start(){
    this.setup_discord();

    this.client.login(TOKEN);
  }

  setup_discord(){
    const command_h_list = [];
    const command_m_list = [];
    for(let h of h_list) command_h_list.push({ name: h, value: h_list.indexOf(h) });
    for(let m of m_list) command_m_list.push({ name: m, value: m_list.indexOf(m) });

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
      },
      {
        name: "alarm",
        description: "力の限り起こすよ！",
        options: [
          {
            type: ApplicationCommandOptionType.Integer,
            name: "hour",
            description: "時間だったりそうじゃなかったりする",
            required: true,
            choices: command_h_list
          },
          {
            type: ApplicationCommandOptionType.Integer,
            name: "min",
            description: "3分間待ってやる！",
            required: true,
            choices: command_m_list
          }
        ]
      },
      {
        name: "del_alarm",
        description: "目覚まし時計を破壊できる"
      }
    ];

    this.client.on('ready', async () => {
      await this.client.application.commands.set(command);
    });

    this.client.on('interactionCreate', this.onInteraction.bind(this));
    this.client.on('voiceStateUpdate', this.onVoiceStatusUpdate.bind(this));
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
        case "alarm":
          await this.alarm_command(interaction);
          break;
        case "del_alarm":
          await this.del_alarm_command(interaction);
          break;
        case "stop":
          await this.stop_command(interaction);
          break;
        default:
          await interaction.reply("そんなコマンドないよ");
          break;
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

  // メンバーとギルドだけ取得しといて時間後の準備しとく
  // IDの規則はguild+member
  async alarm_command(interaction){
    const guild = interaction.guild;

    const guild_id = interaction.guild.id;
    const member_id = interaction.member.id;

    let guild_alarms = this.alarm_list.get(guild_id);

    if(!guild_alarms) guild_alarms = new Map();
    if(guild_alarms.get(member_id)){
      interaction.reply("もう設定されてるよ");
    }

    const alarm_hour = interaction.options.get("hour").value;
    let alarm_min = interaction.options.get("min").value;
    // 5分区切りなので
    alarm_min = alarm_min * 5;

    const now = new Date();
    let alarm_time = new Date();
    alarm_time.setHours(alarm_hour);
    alarm_time.setMinutes(alarm_min);
    alarm_time.setSeconds(0);

    // もし設定時刻が今日にないなら明日にする
    if(alarm_time < now) alarm_time.setDate(alarm_time.getDate() + 1);

    const alarm_info = {
      text: interaction.channel.id,
      hour: alarm_hour,
      min: alarm_min,
      timer_id: null,
      count: 0,
      is_play: false
    };

    guild_alarms.set(member_id, alarm_info);

    this.alarm_list.set(guild_id, guild_alarms);

    const ms = alarm_time.getTime() - now.getTime();

    alarm_info.timer_id = setTimeout(this.alarm_play.bind(this, guild_id, member_id), ms);

    const time_formated = dateformat(alarm_time, 'yyyy/mm/dd HH:MM');

    interaction.reply(`${time_formated}にアラームをセットしました`);
  }

  async del_alarm_command(interaction){
    const guild_id = interaction.guild.id;
    const member_id = interaction.member.id;

    const guild_alarms = this.alarm_list.get(guild_id);
    if(!guild_alarms){
      interaction.reply("アラームがないよ");
      return;
    }
    const info = guild_alarms.get(member_id);
    if(!info){
      interaction.reply("アラームがないよ");
      return;
    }

    clearTimeout(info.timer_id);
    guild_alarms.delete(member_id);

    interaction.reply("取り消ししたよ！");
  }

  async alarm_play(guild_id, member_id){
    // これらないことあるのかな
    const guild_alarms = this.alarm_list.get(guild_id);
    if(!guild_alarms){
      return;
    }
    const info = guild_alarms.get(member_id);
    if(!info){
      return;
    }

    let guild, channel, member;

    try{
      guild = await this.client.guilds.fetch(guild_id);
      channel = await this.client.channels.fetch(info.text);
      member = await guild.members.fetch(member_id);
    }catch(e){
      console.log(e);
      guild_alarms.delete(member_id);
      return;
    }

    const member_vc = member.voice.channel;
    if(!member_vc){
      await channel.send("起こす人いないなぁ…");
      guild_alarms.delete(member_id);
      return;
    }
    if(!member_vc.joinable){
      await channel.send("起こしに行けない…");
      guild_alarms.delete(member_id);
      return;
    }
    if(!member_vc.speakable){
      await channel.send("発言できない…");
      guild_alarms.delete(member_id);
      return;
    }

    if(getVoiceConnection(guild_id)){
      await channel.send("起こせるの1人までなんだ…\n代わりに起こして…");
      guild_alarms.delete(member_id);
      return;
    }

    const connection = joinVoiceChannel({
      guildId: guild_id,
      channelId: member_vc.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: true
    });

    connection.on(VoiceConnectionStatus.Disconnected, async(oldState, newState)=>{
      try{
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      }catch(e){
        try{
          // すでに接続が破棄されてる場合がある
          connection.destroy();
        }catch(e){
          console.log(e)
        }
      }
    });

    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    connection.subscribe(player);

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      player.stop();
      guild_alarms.delete(member_id);
    })

    const res = createAudioResource(VOICE_PATH);

    player.play(res);

    player.on(AudioPlayerStatus.Idle, this.handle_idle.bind(this, guild_id, member_id, player));

    await channel.send("起きろーーーーーー！");
    info.is_play = true;
  }

  async handle_idle(guild_id, member_id, player){
    const guild_alarms = this.alarm_list.get(guild_id);
    if(!guild_alarms){
      return;
    }
    const info = guild_alarms.get(member_id);
    if(!info){
      return;
    }

    if(info.count > 1){
      await this.count_disconnect(guild_id, member_id);
      return;
    }

    // 5分待機
    await sleep(5 * (60 * 1000));

    // 接続チェック
    const guild_alarms2 = this.alarm_list.get(guild_id);
    if(!guild_alarms2){
      return;
    }
    const info2 = guild_alarms2.get(member_id);
    if(!info2){
      return;
    }

    const res = createAudioResource(VOICE_PATH);

    try{
      player.play(res);
      info.count++;
    }catch(e){
      console.log(e);
    }
  }

  async count_disconnect(guild_id, member_id){
    const guild_alarms = this.alarm_list.get(guild_id);
    if(!guild_alarms){
      return;
    }
    const info = guild_alarms.get(member_id);
    if(!info){
      return;
    }

    let guild, channel;

    try{
      guild = await this.client.guilds.fetch(guild_id);
      channel = await this.client.channels.fetch(info.text);
    }catch(e){
      console.log(e);
      guild_alarms.delete(member_id);
      return;
    }

    await channel.send("もう付き合えないかな。");
    const connection = getVoiceConnection(guild_id);
    if(!connection) return;
    connection.destroy();
  }

  async onVoiceStatusUpdate(old_s, new_s){
    const guild_id = new_s.guild.id;
    const member_id = new_s.member.id;

    const guild_alarms = this.alarm_list.get(guild_id);
    if(!guild_alarms){
      return;
    }
    const info = guild_alarms.get(member_id);
    if(!info){
      return;
    }

    // アラーム動作時以外は無視
    if(!info.is_play) return;

    const new_voice_id = new_s.channelId;
    const old_voice_id = old_s.channelId;

    if(old_voice_id === new_voice_id) return;

    let guild, channel;

    if(new_s.channelId === null){
      try{
        guild = await this.client.guilds.fetch(guild_id);
        channel = await this.client.channels.fetch(info.text);
      }catch(e){
        console.log(e);
        guild_alarms.delete(member_id);
        return;
      }

      await channel.send("おはよう！");
      const connection = getVoiceConnection(guild_id);
      if(!connection) return;
      connection.destroy();
    }
  }
}

function main(){
  const app = new App();

  app.start();
}

main();
