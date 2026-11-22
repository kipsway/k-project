#!/usr/bin/env python3
"""
kGram Mozaik Theme Generator (by kipsway)
Constructs a comprehensive, production-grade .attheme file matching
the Chatterino+ (chat.eblo.id) palette by Rish:
- Deep Onyx: #0A0A0C
- Panels / Action bars: #0F0F12
- Cells / Cards: #1C1B21
- Borders / Dividers: #2C2B32
- Lavender Accent: #B8A7F0
- Lavender Glow / Ink: #D9CFFD
- Accent Bubble Surface: #2A2442
- Accent Rim / Outline: #7E6FC4
- Primary Ink: #ECEBF1
- Muted / Secondary: #8D8A99
- Faint: #6F6C7A
"""

import os

def hex_to_attheme_int(hex_str, alpha=0xFF):
    """
    Converts #RRGGBB or #AARRGGBB to signed 32-bit integer as used by Telegram .attheme
    """
    hex_clean = hex_str.strip().lstrip("#")
    if len(hex_clean) == 6:
        r = int(hex_clean[0:2], 16)
        g = int(hex_clean[2:4], 16)
        b = int(hex_clean[4:6], 16)
        a = alpha
    elif len(hex_clean) == 8:
        a = int(hex_clean[0:2], 16)
        r = int(hex_clean[2:4], 16)
        g = int(hex_clean[4:6], 16)
        b = int(hex_clean[6:8], 16)
    else:
        raise ValueError(f"Invalid hex string: {hex_str}")

    val = (a << 24) | (r << 16) | (g << 8) | b
    if val >= 0x80000000:
        val -= 0x100000000
    return val

def generate_mozaik_theme():
    # Palette definition
    c_bg_onyx = hex_to_attheme_int("#0A0A0C")
    c_bg_panel = hex_to_attheme_int("#0F0F12")
    c_well_f = hex_to_attheme_int("#0B0B0D")
    c_cell_off = hex_to_attheme_int("#1C1B21")
    c_cell_dim = hex_to_attheme_int("#36353E")
    c_border = hex_to_attheme_int("#2C2B32")
    c_border_faint = hex_to_attheme_int("#1F1E24")
    c_ink = hex_to_attheme_int("#ECEBF1")
    c_muted = hex_to_attheme_int("#8D8A99")
    c_faint = hex_to_attheme_int("#6F6C7A")
    c_lav = hex_to_attheme_int("#B8A7F0")
    c_lav_ink = hex_to_attheme_int("#D9CFFD")
    c_acc_f = hex_to_attheme_int("#2A2442")
    c_acc_r = hex_to_attheme_int("#7E6FC4")
    c_acc_f_sel = hex_to_attheme_int("#352D54")
    c_red = hex_to_attheme_int("#F24D5C")
    c_green = hex_to_attheme_int("#3FB950")

    # Translucent variants
    c_lav_15 = hex_to_attheme_int("#B8A7F0", alpha=0x26)
    c_lav_25 = hex_to_attheme_int("#B8A7F0", alpha=0x40)
    c_selector = hex_to_attheme_int("#B8A7F0", alpha=0x1F)
    c_selector_dark = hex_to_attheme_int("#FFFFFF", alpha=0x0F)
    c_overlay = hex_to_attheme_int("#0A0A0C", alpha=0xCC)

    theme_dict = {
        # --- Window & Base ---
        "windowBackgroundWhite": c_bg_onyx,
        "windowBackgroundGray": c_bg_panel,
        "windowBackgroundWhiteBlackText": c_ink,
        "windowBackgroundWhiteGrayText": c_muted,
        "windowBackgroundWhiteGrayText2": c_faint,
        "windowBackgroundWhiteGrayText3": c_faint,
        "windowBackgroundWhiteGrayText4": c_faint,
        "windowBackgroundWhiteGrayText5": c_faint,
        "windowBackgroundWhiteGrayText6": c_faint,
        "windowBackgroundWhiteGrayText7": c_faint,
        "windowBackgroundWhiteGrayText8": c_faint,
        "windowBackgroundWhiteLinkText": c_lav,
        "windowBackgroundWhiteValueText": c_lav,
        "windowBackgroundWhiteBlueText": c_lav,
        "windowBackgroundWhiteBlueText2": c_lav_ink,
        "windowBackgroundWhiteBlueText3": c_lav,
        "windowBackgroundWhiteBlueText4": c_lav,
        "windowBackgroundWhiteBlueText5": c_lav,
        "windowBackgroundWhiteBlueText6": c_lav,
        "windowBackgroundWhiteBlueText7": c_lav,
        "windowBackgroundWhiteBlueHeader": c_lav,
        "windowBackgroundWhiteRedText": c_red,
        "windowBackgroundWhiteRedText2": c_red,
        "windowBackgroundWhiteRedText3": c_red,
        "windowBackgroundWhiteRedText4": c_red,
        "windowBackgroundWhiteRedText5": c_red,
        "windowBackgroundWhiteRedText6": c_red,
        "windowBackgroundWhiteGreenText": c_green,
        "windowBackgroundWhiteGreenText2": c_green,
        "windowBackgroundWhiteGrayIcon": c_muted,
        "windowBackgroundWhiteBlueIcon": c_lav,
        "windowBackgroundWhiteInputField": c_border,
        "windowBackgroundWhiteInputFieldActivated": c_lav,
        "windowBackgroundWhiteInputText": c_ink,
        "windowBackgroundWhiteHintText": c_faint,
        "windowBackgroundWhiteLinkSelection": c_lav_25,
        "windowBackgroundSeparator": c_border,
        "windowBackgroundCheck": c_lav,
        "windowBackgroundUnchecked": c_muted,
        "divider": c_border,
        "fastScrollActive": c_lav,
        "fastScrollInactive": c_border,
        "fastScrollText": c_ink,

        # --- Action Bar ---
        "actionBarDefault": c_bg_panel,
        "actionBarDefaultIcon": c_ink,
        "actionBarDefaultTitle": c_ink,
        "actionBarDefaultSubtitle": c_muted,
        "actionBarDefaultSelector": c_selector,
        "actionBarDefaultSearch": c_ink,
        "actionBarDefaultSearchPlaceholder": c_faint,
        "actionBarDefaultSubmenuBackground": c_bg_panel,
        "actionBarDefaultSubmenuItem": c_ink,
        "actionBarDefaultSubmenuItemIcon": c_muted,
        "actionBarActionModeDefault": c_bg_panel,
        "actionBarActionModeDefaultTop": c_bg_panel,
        "actionBarActionModeDefaultIcon": c_lav,
        "actionBarActionModeDefaultSelector": c_selector,

        # --- Chat List & Dialogs ---
        "chats_name": c_ink,
        "chats_message": c_muted,
        "chats_date": c_faint,
        "chats_actionBackground": c_lav,
        "chats_actionPressedBackground": c_acc_r,
        "chats_actionIcon": c_bg_onyx,
        "chats_unreadCounter": c_lav,
        "chats_unreadCounterMuted": c_cell_dim,
        "chats_unreadCounterText": c_bg_onyx,
        "chats_unreadCounterTextMuted": c_muted,
        "chats_pinnedIcon": c_lav,
        "chats_menuBackground": c_bg_panel,
        "chats_menuItemText": c_ink,
        "chats_menuItemIcon": c_muted,
        "chats_menuItemCheck": c_lav,
        "chats_pinnedOverlay": c_selector_dark,
        "chats_tabletSelectedOverlay": c_lav_15,
        "chats_draft": c_lav,
        "chats_sentCheck": c_lav,
        "chats_sentReadCheck": c_lav,
        "chats_archiveBackground": c_cell_off,
        "chats_archiveIcon": c_lav,
        "chats_archiveText": c_ink,
        "chats_nameMessage_local": c_lav,

        # --- Main Tabs / Bottom Navigation ---
        "chats_tabUnreadActiveBackground": c_lav,
        "chats_tabUnreadUnactiveBackground": c_cell_dim,
        "chats_tabUnreadActiveText": c_bg_onyx,
        "chats_tabUnreadUnactiveText": c_muted,
        "actionBarTabActiveText": c_lav,
        "actionBarTabUnactiveText": c_muted,
        "actionBarTabSelector": c_selector,
        "actionBarTabLine": c_lav,
        "chats_floatingBackground": c_lav,
        "chats_floatingButtonPressed": c_acc_r,
        "chats_floatingIcon": c_bg_onyx,

        # --- In-Chat Experience ---
        "chat_wallpaper": c_bg_onyx,
        "chat_inBubble": c_bg_panel,
        "chat_inBubbleSelected": c_cell_off,
        "chat_inBubbleShadow": 0,
        "chat_outBubble": c_acc_f,
        "chat_outBubbleSelected": c_acc_f_sel,
        "chat_outBubbleShadow": 0,
        "chat_messageTextIn": c_ink,
        "chat_messageTextOut": c_ink,
        "chat_messageLinkIn": c_lav,
        "chat_messageLinkOut": c_lav_ink,
        "chat_inTimeText": c_muted,
        "chat_outTimeText": c_lav,
        "chat_inSentCheck": c_lav,
        "chat_inSentCheckSelected": c_lav_ink,
        "chat_outSentCheck": c_lav,
        "chat_outSentCheckSelected": c_lav_ink,
        "chat_inSentCheckRead": c_lav,
        "chat_inSentCheckReadSelected": c_lav_ink,
        "chat_outSentCheckRead": c_lav,
        "chat_outSentCheckReadSelected": c_lav_ink,
        "chat_inSiteName": c_lav,
        "chat_outSiteName": c_lav_ink,
        "chat_inReplyNameText": c_lav,
        "chat_outReplyNameText": c_lav_ink,
        "chat_inReplyLine": c_lav,
        "chat_outReplyLine": c_lav_ink,
        "chat_inReplyMessageText": c_muted,
        "chat_outReplyMessageText": c_lav,
        "chat_inPreviewInstantText": c_lav,
        "chat_outPreviewInstantText": c_lav_ink,
        "chat_inPreviewInstantSelectedText": c_lav_ink,
        "chat_outPreviewInstantSelectedText": c_lav_ink,
        "chat_inAudioPerfomerText": c_ink,
        "chat_outAudioPerfomerText": c_ink,
        "chat_inAudioTitleText": c_muted,
        "chat_outAudioTitleText": c_lav,
        "chat_inAudioDurationText": c_faint,
        "chat_outAudioDurationText": c_lav,
        "chat_inVoiceSeekbar": c_border,
        "chat_outVoiceSeekbar": c_acc_r,
        "chat_inVoiceSeekbarSelected": c_cell_dim,
        "chat_outVoiceSeekbarSelected": c_lav,
        "chat_inVoiceSeekbarFill": c_lav,
        "chat_outVoiceSeekbarFill": c_lav_ink,

        # Service messages (date pills, notifications)
        "chat_serviceBackground": c_bg_panel,
        "chat_serviceBackgroundSelected": c_cell_off,
        "chat_serviceText": c_ink,
        "chat_serviceIcon": c_muted,
        "chat_serviceLink": c_lav,
        "chat_unreadMessagesStartText": c_lav,
        "chat_unreadMessagesStartBackground": c_bg_panel,
        "chat_selectedOverlay": c_selector_dark,

        # Message Input Panel
        "chat_messagePanelBackground": c_bg_panel,
        "chat_messagePanelShadow": 0,
        "chat_messagePanelText": c_ink,
        "chat_messagePanelHint": c_faint,
        "chat_messagePanelIcons": c_muted,
        "chat_messagePanelSend": c_lav,
        "chat_recordedVoiceDot": c_red,
        "chat_recordVoiceCancel": c_muted,
        "chat_recordTime": c_ink,
        "chat_editDoneIcon": c_lav,
        "chat_replyPanelIcons": c_lav,
        "chat_replyPanelClose": c_muted,
        "chat_replyPanelName": c_lav,
        "chat_replyPanelMessage": c_muted,

        # --- Controls, Toggles, Checkboxes ---
        "switchTrack": c_cell_off,
        "switchTrackChecked": c_acc_r,
        "switchThumb": c_muted,
        "switchThumbChecked": c_lav,
        "checkbox": c_lav,
        "checkboxCheck": c_bg_onyx,
        "radioBackground": c_muted,
        "radioBackgroundChecked": c_lav,

        # --- Dialogs, Popups & Sheets ---
        "dialogBackground": c_bg_panel,
        "dialogBackgroundGray": c_bg_onyx,
        "dialogTextBlack": c_ink,
        "dialogTextLink": c_lav,
        "dialogLinkSelection": c_lav_25,
        "dialogTextGray": c_muted,
        "dialogTextGray2": c_faint,
        "dialogTextGray3": c_faint,
        "dialogTextGray4": c_faint,
        "dialogTextHint": c_faint,
        "dialogIcon": c_muted,
        "dialogRedIcon": c_red,
        "dialogGrayIcon": c_muted,
        "dialogButton": c_lav,
        "dialogButtonSelector": c_selector,
        "dialogCheckboxSquareBackground": c_lav,
        "dialogCheckboxSquareCheck": c_bg_onyx,
        "dialogCheckboxSquareUnchecked": c_muted,
        "dialogRadioBackground": c_muted,
        "dialogRadioBackgroundChecked": c_lav,
        "dialogRoundCheckBox": c_lav,
        "dialogRoundCheckBoxCheck": c_bg_onyx,
        "dialogLineProgress": c_lav,
        "dialogLineProgressBackground": c_border,

        # --- Audio & Video Player ---
        "player_actionBar": c_bg_panel,
        "player_actionBarSelector": c_selector,
        "player_actionBarTitle": c_ink,
        "player_actionBarSubtitle": c_muted,
        "player_actionBarItems": c_muted,
        "player_background": c_bg_onyx,
        "player_progress": c_lav,
        "player_progressBackground": c_border,
        "player_progressCachedBackground": c_cell_off,
        "player_time": c_muted,
        "player_button": c_ink,
        "player_buttonActive": c_lav,

        # --- Profile & Settings ---
        "profile_title": c_ink,
        "profile_creatorIcon": c_lav,
        "profile_adminIcon": c_lav,
        "profile_actionIcon": c_lav,
        "profile_actionBackground": c_bg_panel,
        "profile_actionPressedBackground": c_cell_off,
    }

    return theme_dict

def write_attheme_file(theme_dict, out_path):
    lines = [
        "// kGram Mozaik Theme (Chatterino+ Palette by Rish)",
        "// Onyx #0A0A0C, Panel #0F0F12, Lavender #B8A7F0, Accent #7E6FC4",
        "// Auto-generated by build_mozaik_theme.py",
        ""
    ]
    for key, val in sorted(theme_dict.items()):
        lines.append(f"{key}={val}")

    content = "\n".join(lines) + "\n"
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] Generated: {out_path} ({len(theme_dict)} keys)")

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    theme_dict = generate_mozaik_theme()

    # 1. Output to kgram/theme/mozaik.attheme
    theme_out = os.path.abspath(os.path.join(script_dir, "..", "theme", "mozaik.attheme"))
    write_attheme_file(theme_dict, theme_out)

    # 2. Output to assets for bundling in APK: TMessagesProj/src/main/assets/themes/mozaik.attheme
    upstream_dir = os.path.abspath(os.path.join(script_dir, "..", "..", "kgram_upstream"))
    upstream_assets = os.path.join(upstream_dir, "TMessagesProj", "src", "main", "assets", "themes", "mozaik.attheme")
    write_attheme_file(theme_dict, upstream_assets)

if __name__ == "__main__":
    main()
