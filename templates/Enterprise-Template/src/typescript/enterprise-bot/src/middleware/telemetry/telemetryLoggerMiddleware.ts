// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import { TelemetryClient } from 'applicationinsights';
import { Activity, ActivityTypes, Middleware, ResourceResponse, TurnContext } from 'botbuilder';
import { TelemetryConstants } from './telemetryConstants';

/**
 * Middleware for logging incoming, outgoing, updated or deleted Activity messages into Application Insights.
 * In addition, registers the telemetry client in the context so other Application Insights
 * components can log telemetry.
 * If this Middleware is removed, all the other sample components don't log (but still operate).
 */
export class TelemetryLoggerMiddleware implements Middleware {
    public static readonly AppInsightsServiceKey: string = 'TelemetryLoggerMiddleware.AppInsightsContext';

    /**
     * Application Insights Custom Event name, logged when new message is received from the user
     */
    public static readonly BotMsgReceiveEvent: string = 'BotMessageReceived';

    /**
     * Application Insights Custom Event name, logged when a message is sent out from the bot
     */
    public static readonly BotMsgSendEvent: string = 'BotMessageSend';

    /**
     * Application Insights Custom Event name, logged when a message is updated by the bot (rare case)
     */
    public static readonly BotMsgUpdateEvent: string = 'BotMessageUpdate';

    /**
     * Application Insights Custom Event name, logged when a message is deleted by the bot (rare case)
     */
    public static readonly BotMsgDeleteEvent: string = 'BotMessageDelete';

    private readonly _telemetryClient: TelemetryClient;
    private readonly _logUserName: boolean;
    private readonly _logOriginalMessage: boolean;

    /**
     * Initializes a new instance of the TelemetryLoggerMiddleware class.
     * @param {string} instrumentationKey The Application Insights instrumentation key.  See Application Insights for more information.
     * @param {boolean} logUserName (Optional) Enable/Disable logging user name within Application Insights.
     * @param {boolean} logOriginalMessage (Optional) Enable/Disable logging original message name within Application Insights.
     */
    constructor(telemetryClient: TelemetryClient, logUserName: boolean = false, logOriginalMessage: boolean = false) {
        if (!telemetryClient) {
            throw new Error("Error not found");
        }
        this._telemetryClient = telemetryClient;
        this._logUserName = logUserName;
        this._logOriginalMessage = logOriginalMessage;
    }
    
    /**
     * Gets a value indicating whether indicates whether to log the original message into the BotMessageReceived event.
     */
    public get logUserName(): boolean { return this._logUserName; }

    /**
     * Gets a value indicating whether indicates whether to log the user name into the BotMessageReceived event.
     */
    public get logOriginalMessage(): boolean { return this._logOriginalMessage; }

    /**
     * Records incoming and outgoing activities to the Application Insights store.
     * @param {TurnContext} context The context object for this turn.
     * @param {() => Promise<void>} next The delegate to call to continue the bot middleware pipeline
     */
    public async onTurn(context: TurnContext, next: () => Promise<void>): Promise<void> {
        if (context === null) {
            throw new Error('context is null');
        }

        context.turnState.set(TelemetryLoggerMiddleware.AppInsightsServiceKey, this._telemetryClient);

        // log incoming activity at beginning of turn
        if (context.activity !== null) {

            const activity = context.activity;

            // Log the Application Insights Bot Message Received
            this._telemetryClient.trackEvent({
                name: TelemetryLoggerMiddleware.BotMsgReceiveEvent,
                properties: this.fillReceiveEventProperties(activity)
            });
        }

        // hook up onSend pipeline
        context.onSendActivities(async (ctx, activities, nextSend): Promise<ResourceResponse[]> => {
            // run full pipeline
            const responses = await nextSend();

            activities.forEach((activity) => this._telemetryClient.trackEvent({
                name: TelemetryLoggerMiddleware.BotMsgSendEvent,
                properties: this.fillSendEventProperties(activity as Activity)
            }));

            return responses;
        });

        // hook up update activity pipeline
        context.onUpdateActivity(async (ctx, activity, nextUpdate) => {
            // run full pipeline
            const response = await nextUpdate();

            this._telemetryClient.trackEvent({
                name: TelemetryLoggerMiddleware.BotMsgSendEvent,
                properties: this.fillUpdateEventProperties(activity as Activity)
            });

            return response;
        });

        // hook up delete activity pipeline
        context.onDeleteActivity(async (ctx, reference, nextDelete) => {
            // run full pipeline
            await nextDelete();

            const deletedActivity: Partial<Activity> = TurnContext.applyConversationReference({
                type: ActivityTypes.MessageDelete,
                id: reference.activityId,
            }, reference, false);

            this._telemetryClient.trackEvent({
                name: TelemetryLoggerMiddleware.BotMsgSendEvent,
                properties: this.fillDeleteEventProperties(deletedActivity as Activity)
            });
        });

        if (next !== null) {
            await next();
        }
    }

    /**
     * Fills the Application Insights Custom Event properties for BotMessageReceived.
     * These properties are logged in the custom event when a new message is received from the user.
     * @param {Activity} activity - Last activity sent from user.
     * @returns A dictionary that is sent as "Properties" to Application Insights TrackEvent method for the BotMessageReceived Message.
     */
    private fillReceiveEventProperties(activity: Activity): { [key: string]: string } {
        const properties: { [key: string]: string } = {};

        properties[TelemetryConstants.ActivityIDProperty] = activity.id || "";
        properties[TelemetryConstants.ChannelIdProperty] = activity.channelId;
        properties[TelemetryConstants.FromIdProperty] = activity.from.id || "";
        properties[TelemetryConstants.LocaleProperty] = activity.locale || "";
        properties[TelemetryConstants.RecipientIdProperty] = activity.recipient.id;
        properties[TelemetryConstants.RecipientNameProperty] = activity.recipient.name;
    
        // For some customers, logging user name within Application Insights might be an issue so have provided a config setting to disable this feature
        if (this.logUserName && activity.from.name && activity.from.name.trim()) {
            properties[TelemetryConstants.FromNameProperty] = activity.from.name;
        }

        // For some customers, logging the utterances within Application Insights might be an so have provided a config setting to disable this feature
        if (this.logOriginalMessage && activity.text && activity.text.trim()) {
            properties[TelemetryConstants.TextProperty] = activity.text;
        }

        return properties;
    }

    /**
     * Fills the Application Insights Custom Event properties for BotMessageSend.
     * These properties are logged in the custom event when a response message is sent by the Bot to the user.
     * @param {Activity} activity - Last activity sent from user.
     * @returns A dictionary that is sent as "Properties" to Application Insights TrackEvent method for the BotMessageSend Message.
     */
    private fillSendEventProperties(activity: Activity): { [key: string]: string } {
        const properties: { [key: string]: string } = {};

        properties[TelemetryConstants.ActivityIDProperty] = activity.id || "";
        properties[TelemetryConstants.ChannelIdProperty] = activity.channelId;
        properties[TelemetryConstants.ReplyActivityIDProperty] = activity.replyToId || '';
        properties[TelemetryConstants.RecipientIdProperty] = activity.recipient.id;
        properties[TelemetryConstants.ConversationNameProperty] = activity.conversation.name;
        properties[TelemetryConstants.LocaleProperty] = activity.locale || "";
        properties[TelemetryConstants.RecipientNameProperty] = activity.recipient.name;

        // For some customers, logging the utterances within Application Insights might be an so have provided a config setting to disable this feature
        if (this._logUserName && activity.recipient.name && activity.recipient.name.trim()){
            properties[TelemetryConstants.RecipientNameProperty] = activity.recipient.name;
        }

        // For some customers, logging the utterances within Application Insights might be an so have provided a config setting to disable this feature
        if (this.logOriginalMessage && activity.text && activity.text.trim()) {
            properties[TelemetryConstants.TextProperty] = activity.text;
        }

        return properties;
    }

    /**
     * Fills the Application Insights Custom Event properties for BotMessageUpdate.
     * These properties are logged in the custom event when an activity message is updated by the Bot.
     * For example, if a card is interacted with by the use, and the card needs to be updated to reflect
     * some interaction.
     * @param {Activity} activity - Last activity sent from user.
     * @returns A dictionary that is sent as "Properties" to Application Insights TrackEvent method for the BotMessageUpdate Message.
     */
    private fillUpdateEventProperties(activity: Activity): { [key: string]: string } {
        const properties: { [key: string]: string } = {};
        properties[TelemetryConstants.ChannelIdProperty] = activity.channelId;
        properties[TelemetryConstants.RecipientIdProperty] = activity.recipient.id;
        properties[TelemetryConstants.ConversationIdProperty] = activity.conversation.id;
        properties[TelemetryConstants.ConversationNameProperty] = activity.conversation.name;
        properties[TelemetryConstants.LocaleProperty] = activity.locale || "";

        // For some customers, logging the utterances within Application Insights might be an so have provided a config setting to disable this feature
        if (this.logOriginalMessage && activity.text && activity.text.trim()) {
            properties[TelemetryConstants.TextProperty] = activity.text;
        }

        return properties;
    }

    /**
     * Fills the Application Insights Custom Event properties for BotMessageDelete.
     * These properties are logged in the custom event when an activity message is deleted by the Bot.  This is a relatively rare case.
     * @param {Activity} activity - Last activity sent from user.
     * @returns A dictionary that is sent as "Properties" to Application Insights TrackEvent method for the BotMessageDelete Message.
     */
    private fillDeleteEventProperties(activity: Activity): { [key: string]: string } {
        const properties: { [key: string]: string } = {};
        properties[TelemetryConstants.ChannelIdProperty] = activity.channelId;
        properties[TelemetryConstants.RecipientIdProperty] = activity.recipient.id;
        properties[TelemetryConstants.ConversationIdProperty] = activity.conversation.id;
        properties[TelemetryConstants.ConversationNameProperty] = activity.conversation.name;
        
        return properties;
    }
}
