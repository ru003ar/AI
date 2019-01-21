// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import { ContentModeratorClient } from 'azure-cognitiveservices-contentmoderator';
import { Screen } from 'azure-cognitiveservices-contentmoderator/lib/models';
import { ActivityTypes, Middleware, TurnContext } from 'botbuilder';
import { CognitiveServicesCredentials } from 'ms-rest-azure';
import { Readable } from 'stream';

/**
 * Middleware component to run Content Moderator Service on all incoming activities.
 */
export class ContentModeratorMiddleware implements Middleware {
    /**
     * Key for Text Moderator result in Bot Context dictionary.
     */
    public static readonly ServiceName: string = 'ContentModerator';

    /**
     *Key for Text Moderator result in Bot Context dictionary.
     */
    public static readonly TextModeratorResultKey: string = "TextModeratorResult";
    /**
     * Content Moderator service key.
     */
    public static readonly subscriptionKey: string;
     /**
     * Content Moderator service region.
     */
    private static readonly region: string;
    /**
     * Key for Text Moderator result in Bot Context dictionary.
     */
    private readonly _cmClient: ContentModeratorClient;

    /**
     * Initializes a new instance of the ContentModeratorMiddleware class.
     * @constructor
     * @param {string} subscriptionKey Azure Service Key.
     * @param {string} region Azure Service Region.
     */
    constructor(subscriptionKey: string, region: string) {
        this._cmClient = new ContentModeratorClient(new CognitiveServicesCredentials(subscriptionKey), `https://${region}.api.cognitive.microsoft.com`);
    }

    /**
     * Analyzes activity text with Content Moderator and adds result to Bot Context. Run on each turn of the conversation.
     * @param {TurnContext} context - The Bot Context object.
     * @param {Promise} next - The next middleware component to run.
     * @returns {Promise} A Promise representing the asynchronous operation.
     */
    public async onTurn(context: TurnContext, next: () => Promise<void>): Promise<void> {
        
        if (context.activity.type === ActivityTypes.Message) {

            const content = new Readable();
            content.push(context.activity.text);
            content.push(null);
            const screenResult: Screen = await this._cmClient.textModeration.screenText('text/plain', content, { language: 'eng', autocorrect: true, pII: true, classify: true });

            context.turnState.set(ContentModeratorMiddleware.TextModeratorResultKey, screenResult);
        }

        await next();
    }

}
