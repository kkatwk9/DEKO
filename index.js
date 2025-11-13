import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

// Read review roles from env or fallback to built-in list
const REVIEW_ROLE_IDS = (process.env.REVIEW_ROLE_IDS || '1432734700102877250,1432734700065263683,1432734700065263682').split(',').map(s=>s.trim()).filter(Boolean);

const REQUEST_TYPE_LABELS = {
  join: 'Заявка в семью',
  restore: 'Восстановление',
  unban: 'Снятие ЧС'
};

console.log('Запуск бота...');

client.once(Events.ClientReady, () => {
  console.log(`Бот успешно запущен: ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ---------- /apply-panel ----------
    if (interaction.isChatInputCommand() && interaction.commandName === 'apply-panel') {
      const embed = new EmbedBuilder()
        .setTitle('📨 Панель заявок Versize')
        .setDescription('Выберите нужный тип заявки ниже.')
        .setColor(0x8e44ad);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_form_join')
          .setLabel('Подать заявку в семью')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('open_form_restore')
          .setLabel('Восстановление')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('open_form_unban')
          .setLabel('Снятие ЧС')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });

      return;
    }

    // ---------- кнопки: открытие модалки ----------
    if (interaction.isButton() && interaction.customId.startsWith('open_form_')) {
      const typeKey = interaction.customId.replace('open_form_', ''); // join / restore / unban
      const typeLabel = REQUEST_TYPE_LABELS[typeKey] ?? 'Заявка';

      const modal = new ModalBuilder()
        .setCustomId(`apply_form_${typeKey}`)
        .setTitle(typeLabel);

      const serverInput = new TextInputBuilder()
        .setCustomId('server')
        .setLabel('Ваш сервер')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nickInput = new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Ник / статик')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const ageInput = new TextInputBuilder()
        .setCustomId('age')
        .setLabel('Имя и возраст')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const aboutInput = new TextInputBuilder()
        .setCustomId('about')
        .setLabel('О себе')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const motivationInput = new TextInputBuilder()
        .setCustomId('motivation')
        .setLabel('Мотивация / комментарий')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(serverInput),
        new ActionRowBuilder().addComponents(nickInput),
        new ActionRowBuilder().addComponents(ageInput),
        new ActionRowBuilder().addComponents(aboutInput),
        new ActionRowBuilder().addComponents(motivationInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // ---------- модалки (отправка заявки) ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('apply_form_')) {
      const typeKey = interaction.customId.replace('apply_form_', '');
      const typeLabel = REQUEST_TYPE_LABELS[typeKey] ?? 'Заявка';

      const server = interaction.fields.getTextInputValue('server');
      const nick = interaction.fields.getTextInputValue('nick');
      const age = interaction.fields.getTextInputValue('age');
      const about = interaction.fields.getTextInputValue('about');
      const motivation = interaction.fields.getTextInputValue('motivation');

      const channelId = process.env.APP_CHANNEL_ID;
      if (!channelId) {
        await interaction.reply({ content: 'Ошибка: APP_CHANNEL_ID не задан в .env', ephemeral: true });
        return;
      }

      let forumChannel;
      try {
        forumChannel = await interaction.guild.channels.fetch(channelId);
      } catch (err) {
        console.error('Ошибка получения канала заявок:', err);
        await interaction.reply({ content: 'Ошибка: не могу получить канал заявок. Проверь APP_CHANNEL_ID.', ephemeral: true });
        return;
      }

      if (!forumChannel) {
        await interaction.reply({ content: 'Канал заявок не найден. Проверь APP_CHANNEL_ID.', ephemeral: true });
        return;
      }

      // текст пинга ролей
      const pingText = REVIEW_ROLE_IDS.map(id => `<@&${id}>`).join(' ');

      const embed = new EmbedBuilder()
        .setTitle(`📝 ${typeLabel}`)
        .setDescription(`Заявитель: <@${interaction.user.id}>`)
        .addFields(
          { name: 'Тип заявки', value: typeLabel, inline: false },
          { name: 'Сервер', value: server, inline: false },
          { name: 'Ник / статик', value: nick, inline: false },
          { name: 'Имя и возраст', value: age, inline: false },
          { name: 'О себе', value: about, inline: false },
          { name: 'Мотивация / комментарий', value: motivation, inline: false }
        )
        .setColor(0x9b59b6)
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_${interaction.user.id}`)
          .setLabel('Принять')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny_${interaction.user.id}`)
          .setLabel('Отклонить')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`edit_${interaction.user.id}`)
          .setLabel('Запросить правки')
          .setStyle(ButtonStyle.Secondary)
      );

      try {
        if (forumChannel.type === ChannelType.GuildForum) {
          // создаём публикацию в форуме
          await forumChannel.threads.create({
            name: `${typeLabel} — ${nick}`,
            autoArchiveDuration: 1440,
            message: {
              content: `${pingText} — новая ${typeLabel.toLowerCase()} от <@${interaction.user.id}>`,
              embeds: [embed],
              components: [actionRow]
            }
          });
        } else {
          // запасной вариант: обычный текстовый канал + тред
          const msg = await forumChannel.send({
            content: `${pingText} — новая ${typeLabel.toLowerCase()} от <@${interaction.user.id}>`,
            embeds: [embed],
            components: [actionRow]
          });
          if (msg.startThread) {
            await msg.startThread({
              name: `${typeLabel} — ${nick}`,
              autoArchiveDuration: 1440
            });
          }
        }
      } catch (err) {
        console.error('Ошибка при создании заявки в форуме:', err);
        await interaction.reply({ content: 'Не удалось создать публикацию в форуме. Проверь права бота.', ephemeral: true });
        return;
      }

      await interaction.reply({ content: 'Ваша заявка отправлена на рассмотрение.', ephemeral: true });
      return;
    }

    // ---------- кнопки модерации ----------
    if (interaction.isButton() && ['accept', 'deny', 'edit'].includes(interaction.customId.split('_')[0])) {
      const [action] = interaction.customId.split('_');

      const baseEmbed = interaction.message.embeds[0]
        ? EmbedBuilder.from(interaction.message.embeds[0])
        : new EmbedBuilder().setTitle('Заявка');

      let statusText = '';
      let color = 0x9b59b6;

      if (action === 'accept') {
        statusText = `✅ Принято модератором ${interaction.user.tag}`;
        color = 0x57F287;
      } else if (action === 'deny') {
        statusText = `⛔ Отклонено модератором ${interaction.user.tag}`;
        color = 0xED4245;
      } else if (action === 'edit') {
        statusText = `✏️ Требуются правки (модератор: ${interaction.user.tag})`;
        color = 0xFAA61A;
      }

      baseEmbed.setColor(color).addFields({ name: 'Статус', value: statusText, inline: false });

      try {
        await interaction.update({
          embeds: [baseEmbed],
          components: []
        });
      } catch (err) {
        console.error('Ошибка при обновлении сообщения (update):', err);
        try { await interaction.reply({ content: 'Действие выполнено (fallback).', ephemeral: true }); } catch {}
      }

      return;
    }

  } catch (err) {
    console.error('Ошибка интеракции:', err);
    try {
      if (interaction && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Произошла ошибка, администратор уведомлён.', ephemeral: true });
      }
    } catch {}
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Не удалось выполнить логин бота. Проверь DISCORD_TOKEN в .env', err);
});
