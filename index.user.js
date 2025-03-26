// ==UserScript==
// @name         PlanningCenter YouTube Integration
// @namespace    https://github.com/Auxority/planningcenter-yt-stream-creator
// @version      1.0.0
// @description  Allows you to create a YouTube stream from a PlanningCenter service plan.
// @author       Auxority
// @match        https://services.planningcenteronline.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @license      MIT
// @downloadURL https://github.com/Auxority/planningcenter-yt-stream-creator/raw/refs/heads/main/index.user.js
// @updateURL https://github.com/Auxority/planningcenter-yt-stream-creator/raw/refs/heads/main/index.user.js
// ==/UserScript==

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
      console.debug("Fetching auth token.");
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
        console.debug("Login response:", loginResponse);
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
      console.debug("Checking if user is authenticated.");
      return this.getAccessToken() && !this.hasTokenExpired();
    }

    reset() {
      console.debug("Resetting token service.");
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
      console.debug("Fetching OAuth client ID.");
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
      console.debug(`Executing request to ${url}`);

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
   * Represents the visibility status of a YouTube stream.
   */
  class StreamVisibility {
    static PUBLIC = "public";
    static UNLISTED = "unlisted";
    static PRIVATE = "private";
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

    constructor() {
      this.title = "";
      this.startTime = new Date();
      this.visibility = StreamVisibility.PUBLIC;
    }

    /**
     * Serializes the stream data into a format that can be uploaded to YouTube.
     */
    serialize() {
      return {
        snippet: {
          title: this.getTitle(),
          description: this.getDescription(),
          scheduledStartTime: this.getStartTime().toISOString(),
        },
        status: {
          privacyStatus: this.getVisibility(),
        },
      }
    }

    getTitle() {
      return this.title;
    }

    setTitle(title) {
      this.title = title;
      return this;
    }

    getDescription() {
      return this.description;
    }

    setDescription(description) {
      this.description = description;
      return this;
    }

    getStartTime() {
      return this.startTime;
    }

    setStartTime(startTime) {
      this.startTime = startTime;
      return this;
    }

    getVisibility() {
      return this.visibility;
    }

    setVisibility(visibility) {
      this.visibility = visibility;
      return this;
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
      console.debug("Making dummy API request.");
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

      const data = stream.serialize();

      await this.apiService.executeRequest(this.CREATE_STREAM_ENDPOINT, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data),
      });
    }
  }

  class PlanningCenterService {
    static API_BASE_URL = "https://api.planningcenteronline.com/services/v2";

    constructor() { }

    /**
     * Gets a plan from PlanningCenter by its ID.
     * @param {number} id the ID of the plan
     * @returns {Promise<object>} the plan data
     */
    async fetchPlan(id) {
      const url = this.buildPlanUrl(id);

      try {
        return await this.fetchJsonData(url);
      } catch (error) {
        throw new Error(`Failed to fetch plan: ${error}`);
      }
    }

    /**
     * Gets the notes in a plan from PlanningCenter by its ID.
     * @param {number} planId the ID of the plan
     * @returns {Promise<object>} the notes in the plan
     */
    async fetchNotes(planId) {
      const url = `${this.buildPlanUrl(planId)}/notes`;

      try {
        return await this.fetchJsonData(url);
      } catch (error) {
        throw new Error(`Failed to fetch notes: ${error}`);
      }
    }

    /**
     * Gets the songs in a plan from PlanningCenter by its ID.
     * @param {number} planId the ID of the plan
     * @returns {Promise<object>} the songs in the plan
     */
    async fetchSongs(planId) {
      const items = await this.fetchItems(planId);
      const songIds = items.data.filter((item) => item.relationships.song.data !== null).map((item) => item.relationships.song.data.id);

      try {
        const promises = songIds.map((songId) => this.fetchSong(songId));
        return await Promise.all(promises);
      } catch (error) {
        throw new Error(`Failed to fetch songs: ${error}`);
      }
    }

    async fetchSong(songId) {
      const url = `${PlanningCenterService.API_BASE_URL}/songs/${songId}`;

      try {
        return await this.fetchJsonData(url);
      } catch (error) {
        throw new Error(`Failed to fetch song: ${error}`);
      }
    }

    async fetchItems(planId) {
      const url = `${this.buildPlanUrl(planId)}/items`;

      try {
        return await this.fetchJsonData(url);
      } catch (error) {
        throw new Error(`Failed to fetch items: ${error}`);
      }
    }

    async fetchJsonData(url) {
      const res = await fetch(url, { credentials: "include" });
      return await res.json();
    }

    buildPlanUrl(id) {
      return `${PlanningCenterService.API_BASE_URL}/plans/${id}`;
    }
  }

  /**
   * Handles everything related to the DOM.
   */
  class DomService {
    static ORIGINAL_BUTTON_SELECTOR = `button[aria-label="Share"]`;
    static STREAM_BUTTON_ID = "new-yt-stream";

    constructor() { }

    /**
     * Creates a button that allows the user to create a stream.
     */
    async createStreamButton() {
      console.debug("Creating stream button.");

      const originalButton = await this.queryElement(DomService.ORIGINAL_BUTTON_SELECTOR);

      const youtubeButton = originalButton.cloneNode(true);
      youtubeButton.id = DomService.STREAM_BUTTON_ID;
      youtubeButton.innerText = "New Stream";
      youtubeButton.setAttribute("aria-label", "New Stream");

      originalButton.parentNode.prepend(youtubeButton);

      return youtubeButton;
    }

    /**
     * Checks whether the stream button already exists
     */
    streamButtonExists() {
      const selector = `#${DomService.STREAM_BUTTON_ID}`;
      const element = document.querySelector(selector)
      return element !== undefined && element !== null;
    }

    /**
     * Gets the ID of the plan from the URL.
     * @returns {number}
     */
    getPlanId() {
      const rawId = window.location.pathname.split("/").pop();
      return Number(rawId);
    }

    /**
     * Shows a preview of the stream that will be created, and allows the user to confirm the stream creation.
     * @param {YouTubeStream} stream - The stream to preview.
     */
    confirmStreamCreation(stream) {
      return confirm(`Do you want to create a stream titled "${stream.getTitle()}"?`);
    }

    queryElement(selector) {
      return new Promise((resolve) => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        const observer = new MutationObserver(() => {
          const newElement = document.querySelector(selector);
          if (newElement) {
            observer.disconnect();
            resolve(newElement);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    }
  }

  class DateFormatter {
    static LOCALE_LANGUAGE = "nl-NL";

    static YEAR_FORMAT = "numeric";
    static MONTH_FORMAT = "2-digit";
    static DAY_FORMAT = "2-digit";

    static format(date) {
      const options = {
        year: DateFormatter.YEAR_FORMAT,
        month: DateFormatter.MONTH_FORMAT,
        day: DateFormatter.DAY_FORMAT,
      };

      return date.toLocaleString(DateFormatter.LOCALE_LANGUAGE, options);
    }
  }

  /**
   * Manages the streams that are created and uploaded to YouTube.
   */
  class StreamManager {
    static PREACHER_NOTE_CATEGORY = "Spreker";
    static THEME_NOTE_CATEGORY = "Thema";
    static DESCRIPTION_TEMPLATE = [
      "De diensten beginnen elke zondag om 10:00 uur.",
      "",
      "Liederen",
      "{SONGS}",
      "",
      "Informatie",
      "Wil je meer weten over kerk De Fontein of in contact komen met ons? Bezoek dan onze website https://www.kerkdefontein.nl/",
      "Liever mailen? Dat kan via info@kerkdefontein.nl",
    ].join("\n");

    /**
     * The YouTube stream service used to interact with the YouTube API.
     * @type {YouTubeStreamService}
     */
    youtubeStreamService;

    /**
     * The PlanningCenter service used to interact with the PlanningCenter API.
     * @type {PlanningCenterService}
     */
    planningCenterService;

    /**
     * @param {DomService} domService
     */
    domService;

    /**
     * @param {YouTubeStreamService} youtubeStreamService
     * @param {PlanningCenterService} planningCenterService
     * @param {DomService} domService
     */
    constructor(youtubeStreamService, planningCenterService, domService) {
      this.youtubeStreamService = youtubeStreamService;
      this.planningCenterService = planningCenterService;
      this.domService = domService;
    }

    /**
     * Initializes the stream manager.
     */
    async init() {
      console.debug("Initializing stream manager.");

      const planId = this.domService.getPlanId();

      if (!this.domService.streamButtonExists()) {
        const streamButton = await this.domService.createStreamButton();
        streamButton.addEventListener("click", () => this.onStreamButtonClick(planId));
      } else {
        console.debug(`Stream button already exists!`);
      }
    }

    /**
     * Creates a stream and uploads it to YouTube.
     * @param {number} planId - The ID of the plan to create a stream for.
     */
    async onStreamButtonClick(planId) {
      console.debug("Stream button clicked.");

      const stream = await this.getStreamFromPlanId(planId);

      const confirmed = this.domService.confirmStreamCreation(stream);
      if (confirmed) {
        await this.createStream(stream);
      } else {
        alert("Stream creation cancelled.");
      }
    }

    async getStreamFromPlanId(planId) {
      const planData = await this.planningCenterService.fetchPlan(planId);
      console.debug("Plan data:", planData);

      const notes = await this.planningCenterService.fetchNotes(planId);
      console.debug("Notes:", notes);

      const description = await this.getDescription(planId);
      console.debug("Description:", description);

      const title = this.getTitle(planData, notes);
      console.debug("Title:", title);

      const date = this.getDate(planData);

      return new YouTubeStream()
        .setTitle(title)
        .setDescription(description)
        .setStartTime(date);
    }

    getTitle(planData, notes) {
      const date = this.getFormattedDate(planData);
      console.debug("Date:", date);

      const preacher = this.getPreacher(notes);
      console.debug("Preacher:", preacher);

      const theme = this.getTheme(notes);
      console.debug("Theme:", theme);

      return `${theme} - ${preacher} | ${date}`;
    }

    getFormattedDate(planData) {
      const rawDate = this.getDate(planData);
      return DateFormatter.format(rawDate);
    }

    getDate(planData) {
      const now = new Date();

      console.debug("Date attributes:", planData.data.attributes);

      // PlanningCenter stores dates in UTC, so we need to convert it to local time to match the date & time with the UI.
      const utcDate = new Date(planData.data.attributes.sort_date);

      // The timezone offset is in minutes, so we need to convert it to milliseconds.
      const localOffsetMs = utcDate.getTimezoneOffset() * 60 * 1000;
      let plannedDate = new Date(utcDate.getTime() + localOffsetMs);

      // If the planned date is in the past, we need to schedule the stream for the future.
      if (plannedDate < now) {
        // add 5 minutes to the current time to prevent scheduling a stream in the past.
        plannedDate = new Date(now.getTime() + 5 * 60 * 1000);
      }

      console.debug(`Planned date: ${plannedDate.toISOString()}`);

      return plannedDate;
    }

    async getDescription(planId) {
      const songs = await this.planningCenterService.fetchSongs(planId);
      console.debug("Songs:", songs);

      const songLines = songs.map((song) => {
        const title = song.data.attributes.title;
        const author = song.data.attributes.author;
        return `${title} - ${author}`;
      });

      return StreamManager.DESCRIPTION_TEMPLATE.replace("{SONGS}", songLines.join("\n"));
    }

    getPreacher(notes) {
      return notes.data.filter((note) => note.attributes.category_name === StreamManager.PREACHER_NOTE_CATEGORY)[0].attributes.content;
    }

    getTheme(notes) {
      return notes.data.filter((note) => note.attributes.category_name === StreamManager.THEME_NOTE_CATEGORY)[0].attributes.content;
    }

    async createStream(stream) {
      console.info("Creating stream.", stream);
      await this.youtubeStreamService.uploadStream(stream);
      console.info("Stream uploaded.");
    }
  }

  /**
   * Used to check whether a Single Page Application is on the right page.
   */
  class PageService {
    static PLANS_PAGE_PREFIX = "/plans/";

    static isOnPlansPage() {
      console.log(location.pathname);
      return location.pathname.startsWith(PageService.PLANS_PAGE_PREFIX);
    }
  }

  /**
   * Used to detect URL changes in Single Page Applications
   */
  class URLWatcher {
    /**
    * The function to call when a URL change is detected.
    * @type {Function} the function to call
    */
    callback;

    /**
     * The last URL before a change in URL was detected.
     * Used to compare against the current URL.
     * @type {string} the last known URL of the window
     */
    lastUrl;

    /**
     * Used to check for changes in the URL.
     * @type {MutationObserver} used to detect changes in the DOM
     */
    observer;

    static OBSERVER_CONFIG = {
      subtree: true,
      childList: true,
    };

    constructor(callback) {
      this.callback = callback;
      this.lastUrl = location.href;
    }

    init() {
      this.observer = new MutationObserver(() => this.checkUrlChange());
      this.observer.observe(document, URLWatcher.OBSERVER_CONFIG);

      this.hookHistoryMethod("pushState");
      this.hookHistoryMethod("replaceState");

      this.onUrlChange = () => this.checkUrlChange();
      window.addEventListener("popstate", this.onUrlChange);
      window.addEventListener("urlChange", this.onUrlChange);
    }

    checkUrlChange() {
      if (location.href !== this.lastUrl) {
        this.lastUrl = location.href;
        this.callback();
      }
    }

    hookHistoryMethod(method) {
      const original = history[method];
      history[method] = (...args) => {
        original.apply(history, args);
        window.dispatchEvent(new Event("urlChange"));
      };
    }

    disconnect() {
      this.disconnectObserver();
      window.removeEventListener("popstate", this.onUrlChange);
      window.removeEventListener("urlChange", this.onUrlChange);
    }

    disconnectObserver() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  class App {
    urlWatcher;

    constructor() {
      const tokenService = new TokenService();
      const clientIdService = new ClientIdService();
      this.authService = new AuthService(tokenService, clientIdService);
      const apiService = new YouTubeApiService(this.authService);
      const youtubeStreamService = new YouTubeStreamService(apiService);
      const domService = new DomService(youtubeStreamService);
      const planningCenterService = new PlanningCenterService();
      this.streamManager = new StreamManager(youtubeStreamService, planningCenterService, domService);
      this.urlWatcher = new URLWatcher(() => this.run());
    }

    async init() {
      await this.authService.init();
      this.urlWatcher.init();
    }

    async run() {
      console.info("Running userscript!");
      await this.streamManager.init();
    }
  }

  const app = new App();
  app.init();

  if (PageService.isOnPlansPage()) {
    app.run();
  }
})();