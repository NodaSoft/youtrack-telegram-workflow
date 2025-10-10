/**
 * @module telegram-notifications/notifications
 */

/*
 * YouTrack Workflow for sending notifications to Telegram
 *
 * Functionality:
 * - Sends notifications to watchers (Star on an issue) when a watched issue is changed or when a new comment is added to it
 * - Sends a notification when subscribing to an issue (if subscribed by oneself)
 * - Sends a notification to the assignee of an issue when it’s changed or when a new comment is added
 * - Sends a notification to users mentioned in the issue text or in comments
 */

// Importing required YouTrack modules
var entities = require('@jetbrains/youtrack-scripting-api/entities');
var workflow = require('@jetbrains/youtrack-scripting-api/workflow');
var telegram = require('telegram_notification/telegram');

// User configuration for various types of notifications
var watchers = {
    // Users who want to receive notifications about issues they are subscribed to
    "youtrack_username": 123456 /* telegram chat ID*/,
};

var watchersOnlyImportantEdits = {
    // Users who want to receive notifications ONLY about important changes in issues they are subscribed to
    "youtrack_username": 123456 /* telegram chat ID*/,
};

var assignees = {
    // Notifications for assigned issues
    "youtrack_username": 123456 /* telegram chat ID*/,
};

var mentions = {
    // Notifications when mentioned in an issue text or comment
    "youtrack_username": 123456 /* telegram chat ID*/,
};

// Initializing Telegram client with bot token
var telegramClient = new telegram.Telegram("PUT YOUR BOT TOKEN HERE");

/**
 * Main class for handling Telegram notifications
 */
var telegramNotifier = {
    issue: null,                    // Current issue
    issueLink: '',                  // Issue link in Markdown format
    issueTitle: '',                 // Issue title
    currentAssignee: null,          // Current issue assignee
    assignee: null,                 // New issue assignee
    assigneeName: 'unassigned',     // New assignee’s name
    updater: null,                  // User who made the change
    updaterName: null,              // Name of the user who made the change

    /**
     * Initializes the notification object
     * @param {Object} ctx - Workflow execution context
     */
    init: function (ctx) {
        this.issue = ctx.issue;
        this.issueLink = '[' + this.issue.id + "](" + this.issue.url + ')';
        this.issueTitle = this.issue.summary;
        this.currentAssignee = this.issue.fields.Assignee;

        this.assigneeName = "unassigned";

        // Get assignee information
        if (this.issue.fields.Assignee && this.issue.fields.Assignee.fullName) {
            this.assignee = this.issue.fields.Assignee;
            this.assigneeName = this.assignee.fullName;
        }

        // Determine who performed the action
        if (this.issue.becomesReported) {
            this.updater = this.issue.reporter;
        } else {
            this.updater = ctx.currentUser;
        }

        this.updaterName = this.updater.visibleName;
    },

    /**
     * Gets logins of new watchers (those who just subscribed to the issue)
     * @returns {Array} Array of new watcher logins
     */
    getNewWatcherLogins: function() {
        let newWatchers = [];

        this.issue.tags.added.forEach(function(tag) {
            if (tag.name === "Star") {
                if (tag.owner.login !== this.updater.login) {
                    newWatchers.push(tag.owner.login);
                }
            }
        }.bind(this)); // Bind this context

        return newWatchers;
    },

    /**
     * Gets logins of all issue watchers
     * @returns {Array} Array of watcher logins
     */
    getWatcherLogins: function () {
        let watchers = [];

        this.issue.tags.forEach(function(tag) {
            if (tag.name === "Star") {
                if (tag.owner.login !== this.updater.login) {
                    watchers.push(tag.owner.login);
                }
            }
        }.bind(this)); // Bind this context

        return watchers;
    },

    /**
     * Gets the assignee’s login if a notification should be sent
     * @returns {string} Assignee login or empty string
     */
    getAssigneeLoginIfNeeded: function () {
        if (this.currentAssignee && this.currentAssignee.login &&
            this.updater.login != this.currentAssignee.login) {
            return this.currentAssignee.login;
        }
        return "";
    },

    /**
     * Gets mentions from the issue description
     * @returns {Array} Array of mentioned user logins
     */
    getMentionsInDescription: function () {
        return getMentionsInYoutrack(this.issue.description);
    },

    /**
     * Gets mentions from new comments
     * @returns {Array} Array of mentioned user logins
     */
    getMentionsInNewComments: function () {
        let mentionedYoutrackNicks = [];

        this.issue.comments.forEach(function(comment) {
            if (comment.isNew) {
                mentionedYoutrackNicks = mentionedYoutrackNicks.concat(getMentionsInYoutrack(comment.text));
            }
        });

        return mentionedYoutrackNicks.filter((value, index, self) => self.indexOf(value) === index);
    },

    /**
     * Builds notification text for a new watcher
     * @returns {string} Notification text
     */
    getNewWatcherText: function() {
        return "📳 You are subscribed to the issue " + this.issueTitle +
            "\nAssignee: " + this.assigneeName +
            "\nSubscribed by: " + this.updaterName +
            "\nLink: " + this.issueLink +
            "\nState: " + this.issue.fields.State.presentation +
            "\nPriority: " + this.issue.fields.Priority.presentation;
    },

    /**
     * Builds notification text for a new issue
     * @returns {string} Notification text
     */
    getNewIssueText: function () {
        return "📨 New issue created: " + this.issueTitle +
            "\nAssignee: " + this.assigneeName +
            "\nCreated by: " + this.updaterName +
            "\nLink: " + this.issueLink +
            "\nState: " + this.issue.fields.State.presentation +
            "\nPriority: " + this.issue.fields.Priority.presentation;
    },

    /**
     * Builds notification text for a new comment
     * @returns {string} Notification text
     */
    getNewCommentText: function () {
        let text = "💬 " + this.issueLink + " " + this.issueTitle;

        this.issue.comments.forEach(function(comment) {
            if (comment.isNew) {
                text += "\n\n" + comment.text + " [🔗](" + comment.url + ")" +
                    "\n© _" + comment.author.visibleName + "_";
            }
        });

        return text;
    },

    /**
     * Builds notification text for the assignee
     * @returns {string} Notification text
     */
    getAssigneeText: function () {
        return "❗️ " + this.issueLink + " " + this.issueTitle +
            "\n© _" + this.updaterName + "_";
    },

    /**
     * Builds notification text for issue deletion
     * @returns {string} Notification text
     */
    getRemoveText: function () {
        return "❌️ " + this.issueLink + " " + this.issueTitle + " has been deleted" +
            "\n© _" + this.updaterName + "_";
    },

    /**
     * Builds notification text for issue resolution
     * @returns {string} Notification text
     */
    getResolveText: function () {
        return "✅ " + this.issueLink + " " + this.issueTitle + " has been resolved" +
            "\n© _" + this.updaterName + "_";
    },

    /**
     * Builds notification text for reopening an issue
     * @returns {string} Notification text
     */
    getUnResolveText: function () {
        return "▶ " + this.issueLink + " " + this.issueTitle + " has been reopened" +
            "\n© _" + this.updaterName + "_";
    },

    /**
     * Builds notification text for issue changes
     * @returns {string} Notification text
     */
    getChangesText: function () {
        let text = "✏️ " + this.issueLink + " " + this.issueTitle;

        // Check summary changes
        if (this.issue.isChanged('summary')) {
            text += "\nTitle changed";
        }

        // Check description changes
        if (this.issue.isChanged('description')) {
            text += "\nDescription changed";
        }

        // Check Git branch changes
        if (this.issue.fields["Git branch"] &&
            this.issue.fields["Git branch"].hasOwnProperty('name') &&
            this.issue.isChanged('Git branch')) {
            let oldBranch = this.issue.oldValue("Git branch");
            let newBranch = this.issue.fields["Git branch"];
            text += "\ngit branch: " + (oldBranch ? oldBranch.name : "not specified") +
                " -> *" + newBranch.name + "*";
        }

        // Check "In Production" field changes
        if (this.issue.fields["In Production"] &&
            this.issue.fields["In Production"].hasOwnProperty('name') &&
            this.issue.isChanged('In Production')) {
            const oldValue = this.issue.oldValue("In Production");
            const newValue = this.issue.fields["In Production"];
            text += "\n" + (oldValue ? oldValue.name : "not specified") +
                " -> *" + newValue.name + "*";
        }

        // Check state changes
        if (this.issue.isChanged('State')) {
            const oldState = this.issue.oldValue("State");
            const newState = this.issue.fields.State;
            text += "\n" + (oldState ? oldState.name : "not specified") +
                " -> *" + newState.name + "*";
        }

        // Check assignee changes
        if (this.issue.isChanged('assignee')) {
            const oldAssignee = this.issue.oldValue("Assignee");
            const oldAssigneeName = oldAssignee ? oldAssignee.name : "unassigned";

            if (this.currentAssignee) {
                text += "\nAssignee: " + oldAssigneeName +
                    " -> *" + this.issue.fields.Assignee.fullName + "*";
            } else {
                text += "\nAssignee removed!";
            }
        }

        // Check priority changes
        if (this.issue.isChanged('priority')) {
            const oldPriority = this.issue.oldValue("Priority");
            const newPriority = this.issue.fields.Priority;
            text += "\nPriority: " + (oldPriority ? oldPriority.name : "not specified") +
                " -> *" + newPriority.name + "*";
        }

        // Check type changes
        if (this.issue.isChanged('type')) {
            const oldType = this.issue.oldValue("Type");
            const newType = this.issue.fields.Type;
            text += "\nType: " + (oldType ? oldType.name : "not specified") +
                " -> *" + newType.name + "*";
        }

        // Check project changes
        if (this.issue.isChanged('project')) {
            text += "\nNew project: *" + this.issue.project.name + "*";
        }

        text += "\n© _" + this.updaterName + "_";
        return text;
    }
};

/**
 * Gets a list of recipients’ chat IDs by their logins
 * @param {Array} logins - Array of user logins
 * @param {Object} subscribers - Object with logins and chat_id
 * @returns {Array} Array of chat IDs
 */
var getRecipients = function(logins, subscribers) {
    let recipients = [];

    logins.forEach(function(login) {
        if (subscribers[login]) {
            recipients.push(subscribers[login]);
        }
    });

    return recipients;
};

/**
 * Extracts user mentions from text
 * @param {string} text - Text to analyze
 * @returns {Array} Array of mentioned user logins
 */
var getMentionsInYoutrack = function(text) {
    if (!text) return [];

    const regex = /@([A-Za-z0-9._-]+)/g;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]); // match[1] contains login without "@"
    }

    return matches;
};

/**
 * Main workflow rule for sending notifications
 */
exports.rule = entities.Issue.onChange({
    title: workflow.i18n('Send Telegram notifications when creating, modifying, or commenting an issue'),

    /**
     * Workflow execution condition
     * @param {Object} ctx - Execution context
     * @returns {boolean} true if action should be performed
     */
    guard: function(ctx) {
        var issue = ctx.issue;

        return !issue.comments.added.isEmpty() ||        // Comment added
            issue.becomesResolved ||                     // Issue resolved
            issue.becomesReported ||                     // Issue created
            issue.becomesUnresolved ||                   // Issue reopened
            issue.becomesRemoved ||                      // Issue deleted
            issue.tags.added.isNotEmpty() ||             // Tag added
            issue.isChanged('summary') ||                // Title changed
            issue.isChanged('description') ||            // Description changed
            issue.isChanged('project') ||                // Project changed
            issue.isChanged('Git branch') ||             // Git branch changed
            issue.isChanged('In Production') ||          // "In Production" field changed
            issue.isChanged('State') ||                  // State changed
            issue.isChanged('Assignee') ||               // Assignee changed
            issue.isChanged('type') ||                   // Type changed
            issue.isChanged('priority');                 // Priority changed
    },

    /**
     * Main workflow action
     * @param {Object} ctx - Execution context
     */
    action: function(ctx) {
        // Initialize notification object
        telegramNotifier.init(ctx);

        // Skip if this is a draft
        if (telegramNotifier.issue.id === "Issue.Draft") {
            return;
        }

        // Combine all watchers to check new subscriptions
        const allWatchers = {...watchers, ...watchersOnlyImportantEdits};

        // Check new watchers (subscriptions)
        let newWatchRecipients = getRecipients(telegramNotifier.getNewWatcherLogins(), allWatchers);

        if (newWatchRecipients.length > 0) {
            const textNewWatch = telegramNotifier.getNewWatcherText();
            newWatchRecipients.forEach(function(recipientChatId) {
                telegramClient.sendMessage(recipientChatId, textNewWatch);
            });

            return; // Exit, don’t send other notifications
        }

        // Handle new issue creation
        if (telegramNotifier.issue.becomesReported) {
            const newIssueRecipients = getRecipients(telegramNotifier.getWatcherLogins(), allWatchers)
                .concat(getRecipients([telegramNotifier.getAssigneeLoginIfNeeded()], assignees))
                .concat(getRecipients(telegramNotifier.getMentionsInDescription(), mentions))
                .filter((value, index, self) => self.indexOf(value) === index);

            const textNewIssue = telegramNotifier.getNewIssueText();
            newIssueRecipients.forEach(function(recipientChatId) {
                telegramClient.sendMessage(recipientChatId, textNewIssue);
            });

            return; // Exit, don’t send other notifications
        }

        // Handle new comments
        if (!telegramNotifier.issue.comments.added.isEmpty()) {
            const newCommentRecipients = getRecipients(telegramNotifier.getWatcherLogins(), allWatchers)
                .concat(getRecipients([telegramNotifier.getAssigneeLoginIfNeeded()], assignees))
                .concat(getRecipients(telegramNotifier.getMentionsInNewComments(), mentions))
                .filter((value, index, self) => self.indexOf(value) === index);

            const newCommentText = telegramNotifier.getNewCommentText();

            newCommentRecipients.forEach(function(recipientChatId) {
                telegramClient.sendMessage(recipientChatId, newCommentText);
            });

            return; // Exit, don’t send other notifications
        }

        // Notify assignee when issue assigned
        if (telegramNotifier.issue.isChanged('assignee') &&
            telegramNotifier.currentAssignee &&
            telegramNotifier.currentAssignee.login != telegramNotifier.updater.login &&
            assignees[telegramNotifier.currentAssignee.login]) {

            const assigneeText = telegramNotifier.getAssigneeText();
            const assigneeChatId = assignees[telegramNotifier.currentAssignee.login];
            telegramClient.sendMessage(assigneeChatId, assigneeText);
        }

        // Notify about issue deletion
        if (telegramNotifier.issue.becomesRemoved) {
            const newCommentRecipients = getRecipients(telegramNotifier.getWatcherLogins(), allWatchers) // all watchers
                .concat(getRecipients([telegramNotifier.getAssigneeLoginIfNeeded()], assignees)) // assignee
                .filter((value, index, self) => self.indexOf(value) === index);

            const issueRemovedText = telegramNotifier.getRemoveText();

            newCommentRecipients.forEach(function(recipientChatId) {
                telegramClient.sendMessage(recipientChatId, issueRemovedText);
            });

            return; // Exit, don’t send other notifications
        }

        // Issue resolved — important event
        if (telegramNotifier.issue.becomesResolved) {
            let becomesResolvedRecipients = getRecipients(telegramNotifier.getWatcherLogins(), watchersOnlyImportantEdits);
            const issueResolvedText = telegramNotifier.getResolveText();
            becomesResolvedRecipients.forEach(function(chatId) {
                telegramClient.sendMessage(chatId, issueResolvedText);
            });
        }

        // Issue reopened — important event
        if (telegramNotifier.issue.becomesUnresolved) {
            let becomesUnresolvedRecipients = getRecipients(telegramNotifier.getWatcherLogins(), watchersOnlyImportantEdits);
            const issueUnResolvedText = telegramNotifier.getUnResolveText();
            becomesUnresolvedRecipients.forEach(function(chatId) {
                telegramClient.sendMessage(chatId, issueUnResolvedText);
            });
        }

        // Handle issue changes
        const text = telegramNotifier.getChangesText();

        // Send notifications to regular watchers
        let watcherRecipients = getRecipients(telegramNotifier.getWatcherLogins(), watchers)
            .concat(getRecipients([telegramNotifier.getAssigneeLoginIfNeeded()], assignees))
            .filter((value, index, self) => self.indexOf(value) === index);

        watcherRecipients.forEach(function(chatId) {
            telegramClient.sendMessage(chatId, text);
        });

        // Check for important changes for “important edits only” watchers
        let areThereImportantChanges = telegramNotifier.issue.isChanged('assignee') ||
            telegramNotifier.issue.isChanged('priority') ||
            telegramNotifier.issue.isChanged('project');


        if (areThereImportantChanges) {
            let watcherImportantRecipients = getRecipients(telegramNotifier.getWatcherLogins(), watchersOnlyImportantEdits)
                .filter((value, index, self) => self.indexOf(value) === index);

            watcherImportantRecipients.forEach(function(chatId) {
                telegramClient.sendMessage(chatId, text);
            });
        }
    },

    requirements: {
        State: {
            type: entities.State.fieldType,
        },
        SpentTime: {
            type: entities.Field.periodType,
            name: "Spent Time",
        },
        InProduction: {
            type: entities.EnumField.fieldType,
            name: 'In Production',
        },
        Assignee: {
            type: entities.User.fieldType
        },
        GitBranch: {
            type: entities.Field.stringType,
            name: 'Git branch',
        },
        Type: {
            type: entities.EnumField.fieldType,
        },
        Priority: {
            type: entities.EnumField.fieldType,
        },
    },

    runOn: {
        change: true,
        removal: true
    }
});
