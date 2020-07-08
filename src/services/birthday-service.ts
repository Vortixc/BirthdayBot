import { ActionUtils, BdayUtils, FormatUtils, PermissionUtils } from '../utils';
import { Collection, Guild, GuildMember, MessageEmbed, Role, TextChannel } from 'discord.js';

import { CustomMessageRepo } from './database/repos';
import { GuildData } from '../models/database/guild-models';
import { Logger } from '.';
import { UserData } from '../models/database/user-models';

let Config = require('../../config/config.json');

export class BirthdayService {
    constructor(private customMessageRepo: CustomMessageRepo) {}

    public async celebrateBirthdays(
        guild: Guild,
        guildData: GuildData,
        userDatas: UserData[],
        members: Collection<string, GuildMember>
    ): Promise<void> {
        let birthdayChannel: TextChannel;
        let birthdayRole: Role;
        let trustedRole: Role;

        try {
            birthdayChannel = guild.channels.resolve(
                guildData.BirthdayChannelDiscordId
            ) as TextChannel;
        } catch (error) {
            // No Birthday Channel
        }
        try {
            birthdayRole = guild.roles.resolve(guildData.BirthdayRoleDiscordId);
        } catch (error) {
            // No Birthday Channel
        }
        try {
            trustedRole = guild.roles.resolve(guildData.TrustedRoleDiscordId);
        } catch (error) {
            // No Birthday Channel
        }

        if (!guild.me.hasPermission('MANAGE_ROLES')) birthdayRole = null; // If I can't edit roles the birthday Role is essentially null since I can't give the role
        if (birthdayChannel && !PermissionUtils.canSend(birthdayChannel)) birthdayChannel = null; // If I can't message in the birthday channel it is essentially null since I can't send the birthday message

        if (!birthdayRole && !birthdayChannel) {
            // Skip guild
            return;
        }

        Logger.info(
            `Guild: ${guild.name} (ID: ${guild.id}) passed all settings check for birthday service`
        );

        let birthdayUsers: GuildMember[] = [];

        let preventMessage = guildData.TrustedPreventsMessage;
        let preventRole = guildData.TrustedPreventsRole;

        if (userDatas.length === 0) {
            Logger.info(
                `Guild: ${guild.name} (ID: ${guild.id})'s user data was empty.`
            );
        }

        for (let user of userDatas) {
            let member: GuildMember;
            try {
                member = guild.members.resolve(user.UserDiscordId);
            } catch (error) {
                // Can't find member?
                Logger.info(
                    `User with an ID: ${user.UserDiscordId} failed to be resolved in guild: ${guild.name} (ID: ${guild.id})`)
                continue;
            }

            if (!member) continue;

            if (
                trustedRole &&
                preventMessage &&
                preventRole &&
                !member.roles.cache.has(trustedRole.id)
            ) {
                Logger.info(
                    `User: ${member.user.username} (ID: ${member.id}) was skipped due to not having the trusted role.`
                );
                continue;
            }

            if (BdayUtils.isTimeForBirthdayRole(user)) {
                if (
                    birthdayRole &&
                    !(trustedRole && preventRole && !member.roles.cache.has(trustedRole.id))
                ) {
                    ActionUtils.giveRole(member, birthdayRole);
                } else
                    Logger.info(
                        `User: ${member.user.username} (ID: ${member.id}) did not receive the birthday role due to the trusted role or birthday role`
                    );
            } else
                Logger.info(
                    `User: ${member.user.username} (ID: ${member.id}) did not receive the birthday role since it was not their birthday.`
                );

            if (BdayUtils.isTimeForBirthdayMessage(guildData.MessageTime, user)) {
                if (
                    birthdayChannel &&
                    !(trustedRole && preventMessage && !member.roles.cache.has(trustedRole.id))
                ) {
                    birthdayUsers.push(member);
                } else
                Logger.info(
                    `User: ${member.user.username} (ID: ${member.id}) did not receive the birthday message due to the trusted role or birthday role`
                );
            } else
            Logger.info(
                `User: ${member.user.username} (ID: ${member.id}) did not receive the birthday message since it was not their birthday.`
            );
        }

        // get a string array of the userData keys
        let userDataKeys = userDatas.map(userData => userData.UserDiscordId);

        // Filter OUT anyone whose in userData (whose birthday is today)
        members = members.filter(member => !userDataKeys.includes(member.id));

        if (birthdayRole) {
            members.forEach(member => {
                if (member.roles.cache.has(birthdayRole.id))
                    ActionUtils.removeRole(member, birthdayRole);
            });
        }

        // Birthday Message
        if (birthdayUsers.length > 0) {
            let userList = FormatUtils.joinWithAnd(birthdayUsers.map(user => user.toString()));
            let message = BdayUtils.randomMessage(
                await this.customMessageRepo.getCustomMessages(guild.id)
            ).replace('@Users', userList);

            // Find mentioned role
            let mentionSetting: string;
            let roleInput: Role = guild.roles.resolve(guildData.MentionSetting);

            if (!roleInput || roleInput.guild.id !== guild.id) {
                if (
                    guildData.MentionSetting.toLowerCase() === 'everyone' ||
                    guildData.MentionSetting.toLowerCase() === 'here'
                ) {
                    mentionSetting = '@' + guildData.MentionSetting;
                }
            } else {
                mentionSetting = roleInput.toString();
            }

            if (mentionSetting) birthdayChannel.send(mentionSetting);
            let embed = new MessageEmbed().setDescription(message).setColor(Config.colors.default);
            await birthdayChannel.send(guildData.UseEmbed ? embed : message);
        }
    }
}
