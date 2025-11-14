// index.js (ESM)
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType
} from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  APP_CHANNEL_ID,
  ROLE_IDS,
  AUDIT_CHANNEL_ID,
  LEADERS_LOG_CHANNEL_ID
} = process.env;

const ROLE_IDS_ARRAY = (ROLE_IDS || '')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);

// ===================================================================
//                ИНИЦИАЛИЗАЦИЯ КЛИЕНТА
// ===================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ===================================================================
//                ОПРЕДЕЛЕНИЕ СЛЭШ-КОМАНД
// ===================================================================
const commands = [
  new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Отправить панель заявок'),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать кастомный эмбэд')
    .addStringOption(o => o.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Описание').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Цвет #hex').setRequired(false)),

  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Логировать действие лидеров')
    .addUserOption(o => o.setName('author').setDescription('Кто совершил действие').setRequired(true))
    .addUserOption(o => o.setName('target').setDescription('Над кем действие').setRequired(true))
    .addStringOption(o =>
      o.setName('action')
        .setDescription('Тип действия')
        .setRequired(true)
        .addChoices(
          { name: 'Повышение', value: 'promote' },
          { name: 'Понижение', value: 'demote' },
          { name: 'Выговор', value: 'warn' },
          { name: 'Увольнение', value: 'fire' },
          { name: 'Выдача ранга', value: 'give_rank' }
        )
    )
    .addStringOption(o =>
      o.setName('from_rank')
        .setDescription('С какого ранга')
        .addChoices(
          { name: '8 — Generalisimus', value: '8' },
          { name: '7 — Vice Gen.', value: '7' },
          { name: '6 — Gen. Secretary', value: '6' },
          { name: '5 — Curator', value: '5' },
          { name: '4 — Curator\'s Office', value: '4' },
          { name: '3 — Stacked', value: '3' },
          { name: '2 — Main', value: '2' },
          { name: '1 — NewBie', value: '1' }
        )
    )
    .addStringOption(o =>
      o.setName('to_rank')
        .setDescription('На какой ранг')
        .addChoices(
          { name: '8 — Generalisimus', value: '8' },
          { name: '7 — Vice Gen.', value: '7' },
          { name: '6 — Gen. Secretary', value: '6' },
          { name: '5 — Curator', value: '5' },
          { name: '4 — Curator\'s Office', value: '4' },
          { name: '3 — Stacked', value: '3' },
          { name: '2 — Main', value: '2' },
          { name: '1 — NewBie', value: '1' }
        )
    )
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false))
].map(c => c.toJSON());

// ===================================================================
//                РЕГИСТРАЦИЯ КОМАНД
// ===================================================================
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands
      });
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands
      });
    }

    console.log('Slash commands registered.');
  } catch (e) {
    console.error('Slash registration error:', e);
  }
})();

// ===================================================================
//                         READY
// ===================================================================
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===================================================================
//                 ИНТЕРАКЦИИ (ВСЁ)
// ===================================================================
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ================================================================
    //                     SLASH COMMANDS
    // ================================================================
    if (interaction.isChatInputCommand()) {
      // ---------------- PANEL -----------------
      if (interaction.commandName === "apply-panel") {
        const embed = new EmbedBuilder()
          .setTitle("✉️ Панель заявок Versize")
          .setDescription("Выберите тип заявки:")
          .setColor(0x8e44ad);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("apply_family").setLabel("Вступление").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("apply_restore").setLabel("Восстановление").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("apply_unblack").setLabel("Снятие ЧС").setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // ---------------- EMBED -----------------
      if (interaction.commandName === "embed") {
        const title = interaction.options.getString("title", true);
        const description = interaction.options.getString("description", true);
        const color = interaction.options.getString("color") || "#ffffff";

        const e = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(color);

        await interaction.reply({ embeds: [e] });
        return;
      }

      // ---------------- AUDIT -----------------
      if (interaction.commandName === 'audit') {
        const actor = interaction.options.getUser('author', true);
        const target = interaction.options.getUser('target', true);
        const action = interaction.options.getString('action', true);
        const reason = interaction.options.getString('reason') || '—';
        const fromRank = interaction.options.getString('from_rank') || '—';
        const toRank = interaction.options.getString('to_rank') || '—';

        const ACTION_MAP = {
          promote: 'Повышение',
          demote: 'Понижение',
          warn: 'Выговор',
          fire: 'Увольнение',
          give_rank: 'Выдача ранга'
        };

        const embed = new EmbedBuilder()
          .setTitle("📝 Аудит — запись")
          .setColor(0xf1c40f)
          .addFields(
            { name: "Действие", value: ACTION_MAP[action], inline: true },
            { name: "Кто", value: `<@${actor.id}>`, inline: true },
            { name: "Кого", value: `<@${target.id}>`, inline: true },
            { name: "Из ранга", value: fromRank, inline: true },
            { name: "В ранг", value: toRank, inline: true },
            { name: "Причина", value: reason }
          );

        const auditCh = await client.channels.fetch(AUDIT_CHANNEL_ID);
        await auditCh.send({ embeds: [embed] });

        await interaction.reply({ content: "Аудит записан.", ephemeral: true });
        return;
      }
    }

    // ================================================================
    //                         BUTTONS
    // ================================================================
    if (interaction.isButton()) {
      // ------------- КНОПКИ ЗАЯВОК --------------
      if (interaction.customId.startsWith("apply_")) {
        const type = interaction.customId.replace("apply_", "");

        const modal = new ModalBuilder()
          .setCustomId(`apply_modal_${type}`)
          .setTitle(
            type === "family"
              ? "Заявка в семью"
              : type === "restore"
              ? "Восстановление"
              : "Снятие ЧС"
          );

        // максимум 5 полей
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("your_name")
              .setLabel("Ваше имя (OOC)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("discord")
              .setLabel("Ваш Discord")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ic_name")
              .setLabel("IC Имя, Фамилия, #статик")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("history")
              .setLabel("Где состояли ранее?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("motivation")
              .setLabel("Почему выбираете нас?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      // ------------------ ACCEPT -------------------
      if (interaction.customId.startsWith("accept_")) {
        const thread = interaction.channel;

        if (!thread.isThread())
          return interaction.reply({ content: "Кнопка только в тредах.", ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle("✅ Заявка одобрена")
          .setDescription(`Лидер: <@${interaction.user.id}>`)
          .setColor(0x2ecc71)
          .setTimestamp();

        await thread.send({ embeds: [embed] });

        await thread.setArchived(true).catch(() => {});

        // лог лидеров
        if (LEADERS_LOG_CHANNEL_ID) {
          const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID);
          await logCh.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("📗 Лидер одобрил заявку")
                .addFields(
                  { name: "Лидер", value: `<@${interaction.user.id}>` },
                  { name: "Тред", value: thread.name }
                )
                .setColor(0x2ecc71)
            ]
          });
        }

        await interaction.reply({ content: "Заявка одобрена.", ephemeral: true });
        return;
      }

      // ------------------ DENY -------------------
      if (interaction.customId.startsWith("deny_")) {
        const modal = new ModalBuilder()
          .setCustomId("deny_reason_modal")
          .setTitle("Причина отклонения")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Введите причину")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal);
        return;
      }
    }

    // ===================================================================
    //              MODAL — ПРИЧИНА ОТКЛОНЕНИЯ
    // ===================================================================
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "deny_reason_modal") {
        const reason = interaction.fields.getTextInputValue("reason");
        const thread = interaction.channel;

        const embed = new EmbedBuilder()
          .setTitle("❌ Заявка отклонена")
          .setDescription(`Причина: **${reason}**\nЛидер: <@${interaction.user.id}>`)
          .setColor(0xe74c3c)
          .setTimestamp();

        await thread.send({ embeds: [embed] });
        await thread.setArchived(true).catch(() => {});

        // лог лидеров
        if (LEADERS_LOG_CHANNEL_ID) {
          const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID);
          await logCh.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("📕 Лидер отклонил заявку")
                .addFields(
                  { name: "Лидер", value: `<@${interaction.user.id}>` },
                  { name: "Причина", value: reason }
                )
                .setColor(0xe74c3c)
            ]
          });
        }

        await interaction.reply({ content: "Заявка отклонена.", ephemeral: true });
        return;
      }

      // ===================================================================
      //                  ОБРАБОТКА ЗАЯВОК (MODAL Submit)
      // ===================================================================
      if (interaction.customId.startsWith("apply_modal_")) {
        const type = interaction.customId.replace("apply_modal_", "");

        const yourName = interaction.fields.getTextInputValue("your_name");
        const discord = interaction.fields.getTextInputValue("discord");
        const ic = interaction.fields.getTextInputValue("ic_name");
        const history = interaction.fields.getTextInputValue("history");
        const motivation = interaction.fields.getTextInputValue("motivation");

        // ======= АВТОПРОВЕРКА =======
        const errors = [];
        if (yourName.length < 2) errors.push("Имя слишком короткое.");
        if (!discord.includes('#') && !discord.includes('@'))
          errors.push("Discord указан неверно.");
        if (ic.length < 5) errors.push("IC данные слишком короткие.");
        if (history.length < 10) errors.push("История слишком короткая.");
        if (motivation.length < 10) errors.push("Мотивация слишком короткая.");

        if (errors.length > 0) {
          await interaction.reply({
            content: "❌ Ошибки:\n" + errors.map(e => `• ${e}`).join("\n"),
            ephemeral: true
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(
            type === 'family'
              ? '📩 Новая заявка на вступление'
              : type === 'restore'
              ? '📩 Заявка на восстановление'
              : '📩 Заявка на снятие ЧС'
          )
          .setColor(0x7b68ee)
          .addFields(
            { name: "Имя", value: yourName },
            { name: "Discord", value: discord },
            { name: "IC данные", value: ic },
            { name: "История", value: history },
            { name: "Мотивация", value: motivation }
          );

        const forum = await client.channels.fetch(APP_CHANNEL_ID);

        const thread = await forum.threads.create({
          name: `Заявка — ${yourName}`,
          message: {
            content:
              ROLE_IDS_ARRAY.length
                ? ROLE_IDS_ARRAY.map(r => `<@&${r}>`).join(" ")
                : "",
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`accept_${interaction.user.id}`)
                  .setLabel("Принять")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`deny_${interaction.user.id}`)
                  .setLabel("Отклонить")
                  .setStyle(ButtonStyle.Danger)
              )
            ]
          }
        });

        await interaction.reply({ content: "Заявка отправлена!", ephemeral: true });
        return;
      }
    }

  } catch (e) {
    console.error("Interaction error:", e);
    if (!interaction.replied) {
      await interaction.reply({ content: "Ошибка выполнения.", ephemeral: true });
    }
  }
});

// ===================================================================
//                            LOGIN
// ===================================================================
client.login(DISCORD_TOKEN).catch(e => {
  console.error("Login error:", e);
});
