# 📦 Telegram Notifier Workflow Installation Guide for YouTrack

This guide explains how to install and activate the **Telegram Notifier** workflow in your YouTrack instance.

---

## 🧩 1. Requirements

Before you start, ensure you have:
- **Administrator rights** in YouTrack.
- Access to **Administration → Workflows**.
- A **Telegram bot token**.
- The following **custom fields** in your project:

| Field Name     | Type     | Description                     |
|----------------|----------|---------------------------------|
| State          | State    | Built-in issue state field      |
| Spent Time     | Period   | Built-in time tracking field    |
| In Production  | Enum     | Custom enum field               |
| Assignee       | User     | Built-in user field             |
| Git branch     | String   | Custom text field               |
| Type           | Enum     | Built-in issue type             |
| Priority       | Enum     | Built-in priority field         |

> If any of these fields don’t exist, create them in **Administration → Custom Fields**, then attach them to your project. Otherwise, the workflow will not work or you need to correct the workflow code - remove not existing fields from the code.
>
> If you don't have a Telegram bot, create one using the Telegram BotFather.

---

## ⚙️ 2. Installation Options

You can install this workflow in two ways:

### **Option A — Create Manually**

1. Open **YouTrack → Administration → Workflows**.
2. Click **New Workflow → Create from Scratch**.
3. Enter the name: `telegram-notifications`.
4. Click **Add Rule → Custom Script**.
5. Paste the workflow’s JavaScript code into the editor.
6. Click **Save**.
7. Repeat 4-6 for each file.

---

### **Option B — Upload a ZIP Package**

If you have several `.js` files (e.g. `notifications.js`, `telegram.js`, etc.):

1. Create a folder named `telegram-notifications/`.
2. Place all `.js` files inside it.
   3Zip the folder:
   ```bash
   zip -r telegram-notifications.zip telegram-notifications/

In YouTrack, open Administration → Workflows → Upload Workflow.

Upload `telegram-notifications.zip`.

## 🧱 3. Attach the Workflow to a Project

Go to **Administration** → **Workflows**.

Find `telegram-notifications` in the list.

Click **Attach to Project**.

Select your target project(s).

Click **Save**.

## 💬 4. Configure Telegram Integration


Configure bot token in `notifications.js`.

Ensure that the bot can message users (chat IDs must be valid).

Configure recipients' youtrack username and chat ID in `notifications.js` in vars:
* `watchers` - Users who want to receive notifications about issues they are subscribed to
* `watchersOnlyImportantEdits` - Users who want to receive notifications ONLY about important changes in issues they are subscribed to
* `assignees` - Notifications for assigned issues
* `mentions` - Notifications when mentioned in an issue text or comment

Test it manually to verify message delivery.

## 🧪 5. Test the Workflow

Open a test issue in your project.

Make a change that should trigger a notification (for example, change the assignee or priority).

Check Telegram to confirm the watcher receives the message.
