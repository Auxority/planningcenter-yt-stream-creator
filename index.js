// ==UserScript==
// @name         PlanningCenter YouTube Integration
// @namespace    https://github.com/Auxority/planningcenter-yt-stream-creator
// @version      2024-11-23
// @description  Allows you to create a YouTube stream from a PlanningCenter service plan.
// @author       Auxority
// @match        https://services.planningcenteronline.com/plans/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

// You must give your browser access to show Popups/Redirects and Google Sign-In popups on the PlanningCenter page.

(() => {
    "use strict";

    /**
     * Represents a key-value storage for settings.
     */
    class SettingsStorage {
        /**
         * Loads a value from the settings storage.
         * @param {string} key
         * @returns {unknown}
         */
        static load(key) {
            // eslint-disable-next-line no-undef
            const value = GM_getValue(key);
            console.debug(`Loaded value for key ${key}: ${value}`);
            return value;
        }

        /**
         * Saves a value to the settings storage.
         * @param {string} key
         * @param {unknown} value
         */
        static save(key, value) {
            console.debug(`Saving value for key ${key}: ${value}`);
            // eslint-disable-next-line no-undef
            GM_setValue(key, value);
        }

        /**
         * Deletes a value from the settings storage.
         * @param {string} key
         * @returns {unknown}
         */
        static delete(key) {
            console.debug(`Deleting value for key: ${key}`);
            // eslint-disable-next-line no-undef
            GM_deleteValue(key);
        }
    }

    /**
     * Represents the response received from the Google OAuth API.
     */
    class AuthToken {
        /**
         * The access token received from the Google OAuth API.
         * @type {string} The access token.
         */
        accessToken;

        /**
         * The expiration time of the access token in seconds.
         * @type {number} The expiration time in seconds.
         */
        expiresIn;

        /**
         * The type of token received from the Google OAuth API.
         * @type {string} The token type.
         */
        tokenType;

        static EXPECTED_TOKEN_TYPE = "Bearer";

        /**
         * @param {string} accessToken
         * @param {number} expiresIn
         * @param {string} tokenType
         */
        constructor(
            accessToken,
            expiresIn,
            tokenType,
        ) {
            this.accessToken = accessToken;
            this.expiresIn = expiresIn;
            this.tokenType = tokenType;
        }

        /**
         * Deserializes the data received from the Google OAuth API into an auth token.
         * @param {object} data The JSON data to deserialize.
         * @returns {AuthToken} The deserialized auth token.
         */
        static deserialize(data) {
            console.debug("Deserializing auth token data.");
            try {
                AuthTokenValidator.validate(data);
            } catch (e) {
                throw new Error(`Failed to validate auth token: ${e}`);
            }

            return new AuthToken(
                data.access_token,
                data.expires_in,
                data.token_type,
            );
        }

        /**
         * Calculates the expiration timestamp of the access token.
         * @returns {number} The expiration timestamp of the access token.
         */
        calculateExpirationTimestamp() {
            console.debug("Calculating expiration timestamp.");
            const now = new Date();
            const newSeconds = now.getSeconds() + this.expiresIn;
            now.setSeconds(newSeconds);
            return now.getTime();
        }

        /**
         * Gets the access token.
         * @returns {string} The access token.
         */
        getAccessToken() {
            console.debug(`Getting access token: ${this.accessToken}`);
            return this.accessToken;
        }
    }

    /**
     * Validates the data received from the Google OAuth API.
     */
    class AuthTokenValidator {
        /**
         * Validates whether the data received from the Google OAuth API is a valid auth token.
         * @param {object} data The data to validate.
         */
        static validate(data) {
            console.debug("Validating auth token data.");
            if (!data) {
                throw new Error("No data provided.");
            }

            try {
                this.validateAccessToken(data.access_token);
                this.validateExpiresIn(data.expires_in);
                this.validateTokenType(data);
            } catch (e) {
                throw new Error(`Invalid data: ${e}`);
            }
        }

        static validateAccessToken(token) {
            if (!this.isValidAccessToken(token)) {
                throw new Error("Invalid access token.");
            }
        }

        static isValidAccessToken(token) {
            return token && token.length > 0;
        }

        static validateExpiresIn(expiresIn) {
            if (!this.isValidExpiresIn(expiresIn)) {
                throw new Error("Invalid expiration time.");
            }
        }

        static isValidExpiresIn(expiresIn) {
            return expiresIn && expiresIn > 0;
        }

        static validateTokenType(data) {
            if (!this.isValidTokenType(data.token_type)) {
                throw new Error("Invalid token type.");
            }
        }

        static isValidTokenType(tokenType) {
            return tokenType && tokenType === AuthToken.EXPECTED_TOKEN_TYPE;
        }
    }

    /**
     * Represents a client used to authenticate the user with the Google OAuth API.
     */
    class AuthClient {
        /**
         * The OAuth client ID used to authenticate the user.
         * @type {string}
         */
        clientId;

        /**
         * The scope of the OAuth client ID.
         * @type {string}
         */
        scope;

        SCOPES = [
            "https://www.googleapis.com/auth/youtube",
        ];

        constructor(clientId) {
            this.clientId = clientId;
            this.scope = this.getScope();
        }

        /**
         * Fetches an authentication token from the Google OAuth API.
         * @returns {Promise<AuthToken>}
         */
        fetchAuthToken() {
            console.info("Fetching auth token.");
            return new Promise((resolve, reject) => {
                const googleClient = this.getGoogleClient(resolve, reject);
                googleClient.requestAccessToken();
            });
        }

        getGoogleClient(resolve, reject) {
            // eslint-disable-next-line no-undef
            return google.accounts.oauth2.initTokenClient({
                client_id: this.clientId,
                scope: this.scope,
                callback: (data) => this.processTokenResponse(data, resolve, reject),
            });
        }

        processTokenResponse(data, resolve, reject) {
            try {
                const loginResponse = AuthToken.deserialize(data);
                console.info(loginResponse);
                resolve(loginResponse);
            } catch (e) {
                reject(`Could not deserialize response: ${e}`);
            }
        }

        getScope() {
            return this.SCOPES.join(this.SCOPE_SEPARATOR);
        }
    }

    /**
     * Represents a service that manages authentication tokens for the user.
     */
    class TokenService {
        ACCESS_TOKEN_KEY = "ACCESS_TOKEN";
        EXPIRATION_TIMESTAMP_KEY = "EXPIRY_TIME";

        constructor() { }

        /**
         * Saves the authentication token to the settings storage.
         * @param {AuthToken} authToken
         */
        saveAuthToken(authToken) {
            const accessToken = authToken.getAccessToken();
            const expirationTimestamp = authToken.calculateExpirationTimestamp();
            SettingsStorage.save(this.ACCESS_TOKEN_KEY, accessToken);
            SettingsStorage.save(this.EXPIRATION_TIMESTAMP_KEY, expirationTimestamp);
        }

        isUserAuthenticated() {
            console.info("Checking if user is authenticated.");
            return this.getAccessToken() && !this.hasTokenExpired();
        }

        reset() {
            console.info("Resetting token service.");
            SettingsStorage.delete(this.ACCESS_TOKEN_KEY);
            SettingsStorage.delete(this.EXPIRATION_TIMESTAMP_KEY);
        }

        getAccessToken() {
            return SettingsStorage.load(this.ACCESS_TOKEN_KEY);
        }

        hasTokenExpired() {
            const expiryTime = SettingsStorage.load(this.EXPIRATION_TIMESTAMP_KEY);
            return !expiryTime || Date.now() > expiryTime;
        }
    }

    /**
     * Represents a service that manages OAuth client IDs for the user.
     */
    class ClientIdService {
        CLIENT_ID_KEY = "CLIENT_ID";

        constructor() { }

        /**
         * Retrieves the OAuth client ID from the user.
         * @returns {string} The OAuth client ID.
         */
        fetchClientId() {
            console.info("Fetching OAuth client ID.");
            const clientId = SettingsStorage.load(this.CLIENT_ID_KEY);
            if (!clientId) {
                return this.showClientIdPrompt();
            }

            return clientId;
        }

        showClientIdPrompt() {
            const clientId = prompt("Please enter your Google OAuth client ID.");
            if (!clientId) {
                throw new Error("No client ID provided.");
            }

            SettingsStorage.save(this.CLIENT_ID_KEY, clientId);

            return clientId;
        }

        reset() {
            SettingsStorage.delete(this.CLIENT_ID_KEY);
        }
    }

    /**
     * Represents a service that manages authentication for the user.
     */
    class AuthService {
        /**
         * Indicates whether the authentication service has been initialized.
         * @type {boolean}
         */
        initialized = false;

        /**
         * The token service used to manage authentication tokens.
         * @type {TokenService}
         */
        tokenService;

        /**
         * The client ID service used to manage OAuth client IDs.
         * @type {ClientIdService}
         */
        clientIdService;

        GOOGLE_AUTH_MODE = "popup";

        GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";

        REDIRECT_URI = "https://services.planningcenteronline.com";

        SCOPE_SEPARATOR = " ";

        /**
         * @param {TokenService} tokenService
         * @param {ClientIdService} clientIdService
         */
        constructor(tokenService, clientIdService) {
            this.tokenService = tokenService;
            this.clientIdService = clientIdService;
        }

        /**
         * Initializes the authentication service by injecting the Google Sign-In script.
         * @returns {Promise<void>}
         */
        async init() {
            console.debug("Initializing authentication service.");
            if (this.initialized) {
                return;
            }

            this.initialized = true;

            await this.injectGSIScript();
        }

        /**
         * Logs the user in using Google OAuth.
         * @returns {Promise<void>}
         */
        async login() {
            if (this.tokenService.isUserAuthenticated()) {
                console.info("User is already authenticated.");
                return;
            }

            await this.authenticate();
        }

        logout() {
            console.info("Logging user out.");
            this.tokenService.reset();
        }

        async injectGSIScript() {
            const script = document.createElement("script");
            script.src = this.GSI_SCRIPT_URL;
            document.head.appendChild(script);

            await new Promise((resolve) => {
                script.onload = resolve;
            });
        }

        async authenticate() {
            console.info("Authenticating user.");

            const client = this.createTokenClient();
            try {
                const loginResponse = await client.fetchAuthToken();
                this.tokenService.saveAuthToken(loginResponse);
            } catch (e) {
                throw new Error(`Failed to fetch access token: ${e}`);
            }
        }

        createTokenClient() {
            const clientId = this.clientIdService.fetchClientId();
            if (!clientId) {
                throw new Error("OAuth client ID is missing or invalid.");
            }

            return new AuthClient(clientId);
        }

        getAccessToken() {
            return this.tokenService.getAccessToken();
        }

        reset() {
            this.tokenService.reset();
            this.clientIdService.reset();
            this.initialized = false;
        }
    }

    /**
     * A service that interacts with the YouTube API to create and manage streams.
     */
    class YouTubeApiService {
        /**
         * The authentication service used to authenticate the user.
         * @type {AuthService}
         */
        authenticationService;

        HTTP_UNAUTHORIZED_CODE = 401;
        HTTP_FORBIDDEN_CODE = 403;

        RETRY_DELAY_MS = 1000;

        YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

        AUTHORIZATION_HEADER_KEY = "Authorization";

        BEARER_TOKEN_PREFIX = "Bearer";

        /**
         * @param {AuthService} authenticationService - The authentication service used to authenticate the user.
         */
        constructor(authenticationService) {
            this.authenticationService = authenticationService;
        }

        /**
         * Executes an API request to the YouTube API.
         * @param {string} endpoint - The API endpoint to call.
         * @param {unknown} options - The options to pass to the fetch request.
         * @returns {Promise<unknown>} The response data from the API.
         */
        async executeRequest(endpoint, options = {}) {
            const url = this.buildUrl(endpoint);
            options.headers = options.headers || new Headers();
            options.headers.set(this.AUTHORIZATION_HEADER_KEY, this.getBearerToken());
            console.info(`Executing request to ${url}`);

            try {
                const res = await fetch(url, options);
                return await this.handleResponse(res, endpoint, options);
            } catch (err) {
                console.error(err);
            }
        }

        async handleResponse(res, endpoint, options) {
            console.debug(res);
            if (res.ok) {
                return await res.json();
            } else if (this.isUnauthorized(res.status)) {
                await this.authenticationService.login();
                // This delay is here to prevent the API from being spammed with requests if the user is not authenticated.
                await this.delay(this.RETRY_DELAY_MS);
                // Retry the request after re-authentication
                return await this.executeRequest(endpoint, options);
            }

            throw new Error("Failed to fetch YouTube data.");
        }

        buildUrl(endpoint) {
            return `${this.YOUTUBE_API_BASE_URL}${endpoint}`;
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        isUnauthorized(status) {
            return (
                status === this.HTTP_UNAUTHORIZED_CODE ||
                status === this.HTTP_FORBIDDEN_CODE
            );
        }

        getRequestOptions() {
            return {
                headers: this.getRequestHeaders(),
            };
        }

        getRequestHeaders() {
            const headers = new Headers();
            const bearerToken = this.getBearerToken();
            headers.set(this.AUTHORIZATION_HEADER_KEY, bearerToken);

            return headers;
        }

        getBearerToken() {
            const accessToken = this.authenticationService.getAccessToken();
            return `${this.BEARER_TOKEN_PREFIX} ${accessToken}`;
        }
    }

    /**
     * Represents a YouTube stream that can be uploaded to YouTube.
     */
    class YouTubeStream {
        /**
         * The title of the stream.
         * @type {string}
         */
        title;

        /**
         * The description of the stream.
         * @type {string}
         */
        description;

        /**
         * The scheduled start time of the stream.
         * @type {Date}
         */
        startTime;

        /**
         * The visibility status of the stream.
         * @type {string}
         */
        visibility;

        PUBLIC_STREAM_VISIBILITY = "public";
        UNLISTED_STREAM_VISIBILITY = "unlisted";
        PRIVATE_STREAM_VISIBILITY = "private";

        /**
         * @param {string} title - The title of the stream.
         * @param {Date} startTime - The scheduled start time of the stream.
         */
        constructor(title, startTime) {
            this.title = title;
            this.startTime = startTime;
            this.visibility = this.PRIVATE_STREAM_VISIBILITY;
        }

        getTitle() {
            return this.title;
        }

        setTitle(title) {
            this.title = title;
        }

        getDescription() {
            return this.description;
        }

        setDescription(description) {
            this.description = description;
        }

        getStartTime() {
            return this.startTime;
        }

        setStartTime(startTime) {
            this.startTime = startTime;
        }

        getVisibility() {
            return this.visibility;
        }

        setVisibility(visibility) {
            this.visibility = visibility;
        }
    }

    /**
     * A service that interacts with the YouTube API to create and manage streams.
     */
    class YouTubeStreamService {
        /**
         * The YouTube API service used to interact with the YouTube API.
         * @type {YouTubeApiService}
         */
        apiService;

        DUMMY_ENDPOINT = "/channels?part=snippet&mine=true";

        CREATE_STREAM_ENDPOINT = "/liveBroadcasts?part=snippet,status";

        /**
         * @param {YouTubeApiService} apiService
         */
        constructor(apiService) {
            this.apiService = apiService;
        }

        /**
         * @deprecated
         * Just a dummy API request to test the API connection and authentication.
         */
        async dummyApiRequest() {
            console.info("Making dummy API request.");
            return await this.apiService.executeRequest(this.DUMMY_ENDPOINT);
        }

        /**
         * Uploads a stream to YouTube.
         * @param {YouTubeStream} stream
         */
        async uploadStream(stream) {
            console.log("Uploading stream to YouTube.");

            const headers = this.apiService.getRequestHeaders();
            headers.set("Content-Type", "application/json");

            const data = {
                snippet: {
                    title: stream.getTitle(),
                    description: stream.getDescription(),
                    scheduledStartTime: stream.getStartTime().toISOString(),
                },
                status: {
                    privacyStatus: stream.getVisibility(),
                }
            };

            await this.apiService.executeRequest(this.CREATE_STREAM_ENDPOINT, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(data),
            });
        }
    }

    /**
     * Handles everything related to the DOM.
     */
    class DomService {
        /**
         * The YouTube stream service used to interact with the YouTube API.
         * @type {YouTubeStreamService}
         * @private
         */
        youtubeStreamService;

        /**
         *
         * @param {YouTubeStreamService} youtubeStreamService
         */
        constructor(youtubeStreamService) {
            this.youtubeStreamService = youtubeStreamService;
        }

        init() {
            console.debug("Initializing DOM service.");
            this.createStreamButton();
        }

        createStreamButton() {
            console.debug("Creating stream button.");
            const button = document.querySelector(`button[aria-label="Share"]`);
            const youtubeButton = button.cloneNode(true);
            youtubeButton.setAttribute("aria-label", "New Stream");
            youtubeButton.innerText = "New Stream";
            button.parentNode.prepend(youtubeButton);

            youtubeButton.addEventListener("click", this.onStreamButtonClick.bind(this));
        }

        async onStreamButtonClick() {
            console.info("Stream button clicked.");

            const songs = this.getSongTitles();
            if (songs.length === 0) {
                console.error("No songs found.");
                return;
            }

            console.info(`Found ${songs.length} songs.`);
            console.info(songs);

            // const stream = new YouTubeStream("Test Stream", new Date());
            // await this.youtubeStreamService.uploadStream(stream);
            // console.info("Stream uploaded.");
        }

        getSongTitles() {
            console.info("Getting song titles.");
            const songTitles = [];

            const orderOfServiceTable = document.querySelector(`div[data-rbd-droppable-id="orderOfServiceTable"]`);
            if (!orderOfServiceTable) {
                console.error("Could not find order of service table.");
                return;
            }

            orderOfServiceTable.querySelectorAll("p").forEach((paragraph) => {
                const title = this.getSongTitleFromParagraph(paragraph);
                if (title) {
                    songTitles.push(title);
                }
            });

            return songTitles;
        }

        getSongTitleFromParagraph(paragraph) {
            const div = paragraph.closest("div");
            const span = div ? div.querySelector("span") : null;
            return span ? paragraph.textContent : null;
        }
    }

    (async () => {
        const tokenService = new TokenService();
        const clientIdService = new ClientIdService();
        const authService = new AuthService(tokenService, clientIdService);
        const apiService = new YouTubeApiService(authService);
        const youtubeStreamService = new YouTubeStreamService(apiService);
        const domService = new DomService(youtubeStreamService);

        await authService.init();

        domService.init();
    })();
})();
