const path = require('path');
const fs = require('fs');
const printf = require('printf');
const fetch = require('node-fetch-commonjs');
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

////////////////// FIREBASE /////////////////////
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();  // no need functions.config().firebase
const db = admin.firestore();
const bucket = admin.storage().bucket();
const project = process.env.PROJECT_ID
const region = process.env.LOCATION_ID
const spec = { memory: "1GB", timeoutSeconds: 540 };

///////////////// Google CLOUD TASK //////////////////
const { CloudTasksClient } = require('@google-cloud/tasks');
// require('dotenv').config() // Import Cloud Task credentials
const client_ct = new CloudTasksClient();

////////////////// LINE /////////////////////
const channel_id = 1

const line = require("@line/bot-sdk");
const lineConfig = {
    "channelAccessToken": process.env.LINE_CLIENT_CHANNEL_TOKEN.split(",")[channel_id],
    "channelSecret": process.env.LINE_CLIENT_CHANNEL_SECRET.split(",")[channel_id]
}
const client = new line.Client(lineConfig);
const { DatetimePicker, PostbackAction, TextMessage, AudioMessage, FlexMessage, ImageCarousel } = require('./LINE_msg_types')

////////////////// I18N /////////////////////
const i18n = require('./i18n');

////////////////// FLEX MESSAGE /////////////////////
const flexs = require('./flex-message');

////////////////// GLOBAL VARIABLES /////////////////////
var protocol = null;  // should be https
var host = null;      // the domain name
var locally = functions.config().run?.online !== 'true'
console.log('locally: ',locally)

/* datetime related */
// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse
class DateUtility {
    static suffix(timezone) {  // timezone in hours
        if (!timezone) return 'Z';
        var sign = '-+'[+(timezone > 0)];
        var totalmin = Math.abs(timezone) * 60;
        var hr = Math.floor(totalmin / 60);
        return sign + printf('%02d:%02d', hr, totalmin % 60);
    }
    static toDatetimeString(timestamp, timezone, key) {
        var alarm = new Date(timestamp + timezone * 3600 * 1000)
        var s = alarm.toISOString();
        let regex_src = /(....-)?(..-..)T(..:..).*/
        let regex_dest = '$2   $3'
        if (new Date().getFullYear() != alarm.getFullYear()) {
            regex_dest = '$1$2   $3'
        }
        if (key == 'friendly') {
            s = s.replace(regex_src, regex_dest)
            return s
        }
        return s.slice(0, -1) + this.suffix(timezone);
    }
    static durationUntilAlarm(__, alarmTimestamp) {

        let next = new Date(alarmTimestamp)

        let curr = new Date()
        let currMonth = curr.getMonth() + 1
        let currYear = curr.getFullYear()

        let diff = next - curr.getTime()

        function getDaysInMonth(year, month) {
            return new Date(year, month, 0).getDate();
        }

        let timeUnits = [1000, 60, 60, 24]
        let ans_string = ""

        for (let i = 0; i < timeUnits.length; i++) {
            let div = 1
            for (let j = 0; j < timeUnits.length - i; j++) {
                div *= timeUnits[j]
            }
            let val = Math.floor(diff / div)
            diff -= val * div

            if (val == 0) continue

            let timeQualifier = __(`duration.waitUntilTimer.lb_${timeUnits.length - i}`)

            if (timeQualifier == 'days') {
                let months = 0, weeks = 0, days = 0

                let val_days = val
                let daysInNextMonth = getDaysInMonth(currMonth, currYear)
                while (val_days > daysInNextMonth) {
                    val_days -= daysInNextMonth
                    currMonth++;
                    months++
                    console.log(val_days, daysInNextMonth, currMonth)
                    if (currMonth > 12) {
                        currMonth = 0
                        currYear += 1
                    }
                    daysInNextMonth = getDaysInMonth(currMonth, currYear)
                }
                if (val_days % 7 == 0) {
                    weeks = val_days / 7
                } else {
                    days = val_days
                }

                if (months) {
                    ans_string += `${months} ` + __(`duration.waitUntilTimer.lb_${timeUnits.length - i + 2}`) + `, `
                }

                if (weeks) {
                    ans_string += `${weeks} ` + __(`duration.waitUntilTimer.lb_${timeUnits.length - i + 1}`) + `, `
                }
                if (days)
                    ans_string += `${days} `+timeQualifier + `, `
                continue
            }
            ans_string += `${val} ` + timeQualifier
            if (i < timeUnits.length - 1)
                ans_string += ', '

        }

        console.log(ans_string)
        return ans_string
    }
    static parseDatetime(datetime, timezone) {
        /* datetime format look like 2017-12-25T01:00 */
        var ret = Date.parse(datetime + this.suffix(timezone));
        if (isNaN(ret)) {
            console.warn(`unexpected NaN: ${datetime + this.suffix(timezone)}`);
        }
        return ret;
    }
    static randomTimestamp(maxRange = new Date(2023, 5, 1)) {
        const start = new Date()
        const d = new Date(start.getTime() + Math.random() * (maxRange.getTime() - start.getTime()))
        return d.valueOf()
    }
}

/* storage related */
async function uploadStreamFile(stream, filename, customMetadata) {
    var file = bucket.file(filename);
    var writeStream = file.createWriteStream({
        contentType: 'auto',
        metadata: {
            metadata: customMetadata
        }
    });

    // see https://googleapis.dev/nodejs/storage/latest/File.html#createWriteStream
    await new Promise((resolve, reject) => {
        console.log(`uploading ${filename}...`);
        stream.pipe(writeStream)
            .on('error', reject)
            .on('finish', resolve);
    });

    console.log(`done uploading ${filename}.`);
}

/**
 * customMetadata is (await getFileMetadata(filename)).metadata
 * set: https://cloud.google.com/storage/docs/json_api/v1/objects/insert#request_properties_JSON
 * get: https://cloud.google.com/storage/docs/json_api/v1/objects
 * @param {string} filename
 */
async function getFileMetadata(filename) {
    const file = bucket.file(filename);
    const [metadata] = await file.getMetadata();

    // console.log(`metadata for ${filename}`, metadata);
    return metadata;
}

async function triggerAlarmAsync(userId, alarmId, version) {
    console.log('triggerAlarm function')
    var url
    if (locally)
        url = `${protocol}://${host}/${project}/${region}/triggerAlarmInLINE?userId=${userId}&alarmId=${alarmId}&version=${version}`
    else
        url = `${protocol}://${region}-${project}.cloudfunctions.net/triggerAlarmInLINE?userId=${userId}&alarmId=${alarmId}&version=${version}`
    console.log(`${alarmId}:`, url);

    await fetch(url)
    return
}

async function getPubUrl(filename) {
    var url
    if (locally) {
        url = `${protocol}://${host}/${project}/${region}/publicizeLocalFile?file=${encodeURIComponent(filename)}`;
        console.log(`${filename}:`, url);
    }
    else {
        const urlOptions = {
            version: "v4",
            action: "read",
            expires: Date.now() + 1000 * 60 * 15, // 15 minutes
        }

        const [signed_url_promise] = await bucket
            .file(filename)
            .getSignedUrl(urlOptions);
        url = signed_url_promise;
    }

    return url;
}

////////////////// CODE START /////////////////////

function unexpected(errorMessage) {
    throw new Error(errorMessage);
}

function firstLetterCaptialize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* {} returns true, and [] returns false */
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

function applyDefault(sourceData, defaultData) {
    /* ref: https://stackoverflow.com/questions/27936772/how-to-deep-merge-instead-of-shallow-merge */

    /*  assign default to source when:
            source[key] not exist,
            default[key] is object but source[key] is not

        merge when:
            source[key] and default[key] is object

        other existing keys in source is ignored
    */

    for (const key in defaultData) {
        if (key in sourceData) {
            if (isObject(defaultData[key])) {
                if (isObject(sourceData[key])) {
                    applyDefault(sourceData[key], defaultData[key]);
                } else {
                    sourceData[key] = defaultData[key];
                }
            }
        } else {
            sourceData[key] = defaultData[key];
        }
    }

    return sourceData;
}

////////////////// CLASSES FOR DATA IN FIRESTORE /////////////////////

/* user doc data object structure (to store lang, states, etc) */

class TopLevelData {
    static default() {
        return {
            lang: null,   // or 'en', 'zh', null mean unset
            alarmCounter: 0,   // monotonic counter for alarm id
            timezone: 8,  // only support utc+8 for now, user selected time will minus this
            holder: null, // or 'alarm-setter', state holder
            watchOrder: '-', // track user current preference on watching alarms
            subData: {},  // (holder specific data)
            /*
                subData look like this
                {
                    'alarm-setter': {...},
                    'alarm-watcher': {...},
                    'lang-selector': {...},
                    ... etc
                }
            */
        };
    }
}

/*
alarm-setter data

    {
        audio: null or filename
        alarmTime: null or timestamp (utc)
        state: 'sentAudio', 'sentTime'
    }

*/

/* Quick replies */


////////////////// CHATBOT /////////////////////

function createChatBot(name, belongTo) {
    if (!chatbotsLookup.hasOwnProperty(name)) {
        console.warn(`chatbot ${name} not exists, set name to null`);
        name = null;
    }
    return new chatbotsLookup[name](belongTo);
}

/*
const chatbotsLookup is generated at runtime, which will look like this:
{
    'null': ChatBot,
    'alarm-setter': AlarmSetter,
    'lang-selector': LangSelector,
}

*/
const chatbotsLookup = {};
function register(name, theClass) {
    if (chatbotsLookup.hasOwnProperty(name)) {
        console.error(`name ${name} already exist`)
        throwRegisterFailure(theClass);
    }
    chatbotsLookup[name] = theClass;
    return name;
}
function throwRegisterFailure(theClass) {
    unexpected(`${theClass.name}.NAME should be declared as follows\n`
        + `    static NAME = ${register.name}('{{THE_BOT_NAME}}', this);`);
}

const langs = i18n.get('langs');
console.log('getLangs:', langs)

class BaseDbUserChatBot {
    /**
     * @param {DbUser} belongTo
     */
    constructor(belongTo) {
        this.belongTo = belongTo;
        if (!this.constructor.hasOwnProperty('NAME')) {
            throwRegisterFailure(this.constructor);
        }
    }

    get db() {
        return this.belongTo.db.collection('alarms');
    }
    async size() {
        const query = await this.belongTo.db.collection('alarms').get()
        let size = query.size
        for (const doc of query.docs) {
            if (doc.data().alarmTime < Date.now())
                size--;
        }
        return size
    }
    get alarmCounter() {
        return this.topLevelData.alarmCounter;
    }

    get name() {
        return this.constructor.NAME;
    }

    get topLevelData() {
        return this.belongTo.dbData;
    }

    get subData() {
        let ret = this.topLevelData.subData[this.name];
        return ret ? ret : (this.topLevelData.subData[this.name] = {});
    }

    set subData(val) {
        this.topLevelData.subData[this.name] = val;
    }

    get translator() {
        return this.belongTo.translator;
    }

    get #replies() {
        return this.belongTo.replies;
    }

    get #quickReplies() {
        return this.belongTo.quickReplies;
    }
    async randomPopulateDB(add = 10) {
        console.log("Populating DB with fake timestamps, WARN: no audio data")
        const size_all = this.alarmCounter + add
        for (let i = this.alarmCounter; i < size_all; i++) {
            const alarmTime = DateUtility.randomTimestamp()
            const timerString = new Date(alarmTime).toISOString().slice(0, 19).replace('T', ' ')
            await this.belongTo.db.collection('alarms').doc(`alarm_${i}`).set({
                audio: "random",
                alarmTime: alarmTime,
                version: "random",
                __friendly_time: "" + timerString
            })

        }
        this.topLevelData.alarmCounter = size_all
        this.replyText(`Populated DB to scale: ${size_all}`)
    }

    async generateQuickRepliesAsync(role = '') {
        const __ = this.translator;
        /* HERE to catch ALARM-NOT-SET-YET error */
        if (await this.size() == 0) {
            this.replyText(__('warning.alarms.empty'))
            return false
        }

        //////////// processing QuickReplies role ////////////
        /* handle exit button only for AlarmDeleter*/
        if (role.includes('delete')) {
            this.addQuickReply(new PostbackAction('exiter', __('label.exitButton')))
            this.addQuickReply(new PostbackAction('deleter-all', __('label.deleteAll')))
        }
        /* handle cancel button only for AlarmDeleter*/
        else if (role.includes('cancel')) {
        const alarmId = `alarm_${this.topLevelData.alarmCounter - 1}`;
            this.addQuickReply(new PostbackAction(`alarm-deleter,c,alarm=${alarmId}`, __('label.cancelButton')))
        }

        const query = await this.belongTo.db.collection('alarms').get();
        var sorted = await this.getSortedAlarmsDataAsync('alarmTime', ...query.docs)

        for (let [timestamp, alarmId] of sorted) {
            if (timestamp < Date.now()) continue
            /* the datetime here looks like 2022-10-22T15:29:00.000+08:00 */
            let datetime = this.belongTo.toDatetimeString(timestamp, this.topLevelData.timezone);
            let abbr = datetime.replace(/^....-(..-..)T(..:..).*$/, '$1 $2');
            console.log(`sorting..,`, alarmId, 'datatime', datetime, 'abbr', abbr);

            let label_id = alarmId.replace(/^alarm_/, '')

            var label = `⏰ ${abbr}` //`⏰ ${label_id}, ${abbr}`

            /* modify postback according to role = 'deletion' or not */
            var postback = `alarm-watcher,alarm=${alarmId}`
            if (role == 'delete') {
                postback = `alarm-deleter,alarm=${alarmId}`
            }

            this.addQuickReply(new PostbackAction(postback, label));

        }

        let alarmsInQuickReArr = 0
        for (const item of this.#quickReplies) {
            console.log('finding quickRe Array items...')
            console.log(item.action.label)
            if (item.action.label.includes('⏰ '))
                alarmsInQuickReArr++
        }
        console.log('alarms in QuickRe Arr: ', alarmsInQuickReArr)

        if (alarmsInQuickReArr != 0) {
            if (alarmsInQuickReArr > 1) {
                this.addQuickReply(new PostbackAction('alarm-watcher,chgOrder', __('label.AlarmsOrder')));
            }
            /* to ease alarm editing, show all alarms with FlexMessage carousel */
            if (role.includes('full')) {
                this.addQuickReply(new PostbackAction('alarm-watcher,editAllAlarms', __('label.editAllAlarms')));

            }
            return true
        }
        return false
    }

    async getSortedAlarmsDataAsync(dataToGet, ...docs) {
        /* sort alarms based on their alarmTime timestamp */
        const __ = this.translator;

        var alarms_timestamp_id = {}
        for (const doc of docs) {
            alarms_timestamp_id[`${doc.data().alarmTime}`] = doc.id
        }

        var doc_array = [...docs];

        doc_array.sort((a, b) => {
            return a.data().alarmTime - b.data().alarmTime
        })

        var sorted_arr = doc_array.map(e => [e.data()[dataToGet], e.id])
        if (this.topLevelData.watchOrder == '-')
            sorted_arr = sorted_arr.reverse()

        /* set array length limit, since FlexMsg and quickReplies can only take so much */
        return sorted_arr.slice(0, 8)
    }

    ////////////////// CHATBOT TRANSFORMER /////////////////////

    abort() {  // go to default chatbot
        if (`${this.name}` == 'null') {
            /* you cannot call abort on default chatbot */
            unexpected(`You cannot call abort() on ${this.constructor.name}!`)
        }
        this.onAbort();
        return this.belongTo.setHolder(null, this.onAbort());
    }

    ////////////////// CHATBOT REPLIES /////////////////////

    addQuickReply(...actions) {
        for (let action of actions) {
            if (action.toLINEObject) {
                action = action.toLINEObject();
            }
            this.#quickReplies.push({
                type: 'action',
                action: action
            })
        }
    }

    addQuickReplyText(label, text = label) {
        this.addQuickReply({
            type: 'message',
            label: label,
            text: text
        });
    }

    reply(...messages) {
        this.#replies.push(...messages);
    }

    replyText(...texts) {
        for (const text of texts) {
            this.reply(new TextMessage(text));
        }
    }

    async replyAudio(alarmId) {
        let doc = await this.db.doc(alarmId).get();
        let filename = doc.data().audio;
        let { metadata } = await getFileMetadata(filename);
        console.log('aaa->', await getPubUrl(filename), '\naaaa->', metadata)
        this.reply(new AudioMessage(await getPubUrl(filename), metadata.duration));
    }

    ////////////////// EMPTY CHATBOT REACTS /////////////////////

    onAbort() {  // subclass override this to handle onAbort
        /* return set holder clear true or false, default clear = true */
        return true;
    }

    async reactTextAsync(text, tag) {
        return this.abort().reactTextAsync(...arguments);
    }

    async reactAudioAsync(filename) {
        return this.abort().reactAudioAsync(...arguments);
    }

    async reactPostbackAsync(data, params) {
        return this.abort().reactPostbackAsync(...arguments);
    }

}

class DefaultChatBot extends BaseDbUserChatBot {  /* take the db save/store logic out of reply logic */

    static NAME = register(null, this);

    ////////////////// CHATBOT REACTS /////////////////////

    async reactTextAsync(text, tag) { /* user text, and corresponding tag */
        const __ = this.translator;

        if (text.replace(/(^lang) */, '$1') == 'lang') {
            return this.belongTo.setHolder('lang-selector').changeLang();
        }
        if (text == 'populateDB_devj') {
            await this.randomPopulateDB()
        }
        if (!tag) {
            console.warn(`unhandled tag ${tag}, ${text}`);
        }
        

        return this.replyText(__('reply.hellomsg', text));
    }

    async reactAudioAsync(filename) {
        const __ = this.translator;

        if (this.topLevelData.dev) {
            await this.generateQuickRepliesAsync()
        }

        return this.belongTo.setHolder('alarm-setter').setAudio(filename);
    }

    async reactPostbackAsync(data, params) {
        const __ = this.translator;

        if (data.includes('alarm-watcher')) {
            // this.replyText("here")
            return this.belongTo.setHolder('alarm-watcher').reactPostbackAsync(data)
        }

        if (data == 'db-populator') {
            await this.randomPopulateDB()
        }

        let prefix = 'flex,edit=';
        if (data.startsWith(prefix)) {
            if (!params?.datetime) {
                console.warn('unexpected no datetime');
            } else {
                let alarmId = data.slice(prefix.length);
                return this.belongTo.setHolder('alarm-setter').loadEditWatch(alarmId, params.datetime);
            }
        }
        let prefix2 = 'flex,view='
        if (data.startsWith(prefix2) && this.name != 'alarm-watcher') {
            return this.belongTo.setHolder('alarm-watcher').reactPostbackAsync(data);
        }


        if (data.includes('deleter')) {
            return this.belongTo.setHolder('alarm-deleter').reactPostbackAsync(data);
        }

        if (data == 'exiter') {
            return this.abort().replyText(__('reply.exit'))
        }

    }

}

class AlarmBase extends BaseDbUserChatBot {

    acquireAlarmId() {
        return `alarm_${this.topLevelData.alarmCounter++}`;
    }

    async replyUntilAlarm(alarmId) {
        const __ = this.translator;
        let doc = await this.db.doc(alarmId).get();
        let alarm_timestamp = doc.data().alarmTime
        const durationUntilAlarm_string = DateUtility.durationUntilAlarm(__, alarm_timestamp)
        const friendly_time = DateUtility.toDatetimeString(alarm_timestamp, this.topLevelData.timezone, 'friendly')
        this.replyText(__('reply.alarmScheduled',
            alarmId.replace(/^alarm_(.*)/, '$1'),
            friendly_time,
            durationUntilAlarm_string
        ));
    }

    async alarmOneAsync(alarmId) {
        let doc = await this.db.doc(alarmId).get();
        await this.#_replyFlexAlarms('large', doc);
    }

    async alarmAllAsync() {
        const query = await this.db.get();
        this.#_replyFlexAlarms('small', ...query.docs);
    }

    async #_replyFlexAlarms(scale = 'large', ...docs) {
        const __ = this.translator;
        const sorted = await this.getSortedAlarmsDataAsync('alarmTime', ...docs)

        var arr = []
        for (let [timestamp, alarmId] of sorted) {
            let flex = flexs.alarmScheduled(__, timestamp, this.topLevelData.timezone, alarmId, scale);
            arr.push(flex)
        }
        this.reply(new FlexMessage(new ImageCarousel(arr).toLINEObject()));
    }

}

class AlarmDeleter extends AlarmBase {
    /* role: delete and cancel, since cancel is deleting alarm too */

    static NAME = register('alarm-deleter', this);

    async reactPostbackAsync(data, params) {
        const __ = this.translator;

        console.log("alarm-deleter, pbData: ", data)

        if (data.includes('alarm=')) {
            const id = data.split('=')[1]
            const alarmData = (await this.db.doc(id).get()).data()
            const idx = id.replace(/alarm_(.*)$/, '$1')
            await deleteDocWithIdx(this.belongTo, 'alarms', idx)
            if (alarmData == undefined) { // to very alarm deletion
                this.replyText('Deletion failed! Time to debug')
            }
            else {
                if (data.includes('alarm-deleter,alarm=')) {
                    this.replyText(__('reply.youHaveDeleted', id.replace(/^alarm_(.*)/, '$1'), alarmData.__friendly_time))
                } else if (data.includes('alarm-deleter,c,alarm=')) {
                    this.replyText(__('reply.youHaveCancelled', id.replace(/^alarm_(.*)/, '$1'), alarmData.__friendly_time))
                }
            }

        }
        else if (data == 'deleter-all') {
            const query = await this.db.get()
            for (const doc of query.docs) {
                const idx = doc.id.replace(/alarm_(.*)$/, '$1')
                await deleteDocWithIdx(this.belongTo, 'alarms', idx)
            }

        }

        const finalAlarmsSize = await this.size()

        if (finalAlarmsSize == 0) {
            if (data == 'alarm-deleter')
                this.replyText(__('warning.alarms.empty'))
            else
                this.replyText(__('reply.deletedAll'))
        } else {
            if (data == 'deleter-all')
                this.replyText('Deletion for all alarms failed! Time to debug')

            else if (data.startsWith('alarm-deleter,c,')) {
                await this.generateQuickRepliesAsync()
            } else if (data == 'alarm-deleter') {
                if (await this.generateQuickRepliesAsync('delete'))
                    this.replyText(__('reply.showAlarmsToDelete'))
            } else {
                await this.generateQuickRepliesAsync('delete')
            }
        }

        return this.abort();
        // return this.belongTo.setHolder('alarm-deleter').reactPostback();
    }
}

class AlarmWatcher extends AlarmBase {

    static NAME = register('alarm-watcher', this);

    #changeAlarmOrder() {
        this.topLevelData.watchOrder = this.topLevelData.watchOrder != '-' ? '-' : '+';
    }

    ////////////////// CHATBOT REACTS /////////////////////

    async reactPostbackAsync(data, params) {
        const __ = this.translator;

        let prefix;
        if (data.startsWith(prefix = 'alarm-watcher,alarm=')) {
            let alarmId = data.slice(prefix.length);
            await this.alarmOneAsync(alarmId);
            return this.generateQuickRepliesAsync();
        }
        if (data.includes('deleter')) {
            return this.belongTo.setHolder('alarm-deleter').reactPostbackAsync(data);
        }

        if (data == 'alarm-watcher') {
            if (await this.generateQuickRepliesAsync('full'))
                this.replyText(__('reply.showAlarmsAvailable'));
            return;
        }
        else if (data == 'alarm-watcher,chgOrder') {
            this.#changeAlarmOrder();
            this.replyText(__('reply.chgAlarmsOrder'));
            // keep looping for user to play "sorting" feature, no abort options
            return this.generateQuickRepliesAsync();
        } else if (data == 'alarm-watcher,editAllAlarms') {
            await this.alarmAllAsync();
            return this.generateQuickRepliesAsync('full');

        }

        let prefix2 = 'flex,view='
        if (data.startsWith(prefix2)) {
            console.log('inn')
            let alarmId = data.slice(prefix2.length);
            return await this.replyAudio(alarmId)
        }

        return super.reactPostbackAsync(...arguments);
    }

    /* --------------- CHATBOT SELF OWNED ------------------ */



}

class AlarmSetter extends AlarmBase {
    // only this class, using alarm id don't need to call super method
    static NAME = register('alarm-setter', this);

    ////////////////// CHATBOT REACTS /////////////////////

    async reactPostbackAsync(data, params) {

        const __ = this.translator;

        if (data == 'alarm-setter') {
            if (!params?.datetime) {
                console.warn('unexpected no datetime');
            }
            else if (this.belongTo.parseDatetime(params.datetime) - Date.now() < 0) {
                this.replyText(__('warning.settingAlarm.beforeNow'))
                console.warn('invalid - user has set time before current time')
                return
            }
            else {
                this.subData.alarmTime = this.belongTo.parseDatetime(params.datetime);
                this.subData.alarmId = this.acquireAlarmId();  // acquire a new alarm id
                this.subData.alarmData = this.#generateAlarmData(this.subData);

                await this.#saveAndReply();
            }
            return this.belongTo.setHolder('alarm-watcher').generateQuickRepliesAsync('cancel');
        } else if (data == 'alarm-setter,noThanks') {
            this.replyText(__('reply.okay'));
            return this.abort();
        } else if (data == 'alarm-setter,editAlarms') {
            let bot = this.belongTo.setHolder('alarm-watcher');
            this.replyText(__('reply.showAlarmsAvailable'))
            return bot.generateQuickRepliesAsync();

        }

        else if (data.includes('deleter')) {
            return await this.belongTo.setHolder('alarm-deleter').reactPostbackAsync(data)
        }
        else if (data.includes('watcher')) {
            return await this.belongTo.setHolder('alarm-watcher').reactPostbackAsync(data)
        }


        return super.reactTextAsync(...arguments);
    }

    /* --------------- CHATBOT SELF OWNED ------------------ */

    #generateAlarmData({ version, alarmTime, audio }) {
        version = (version || 0) + 1;
        return {
            audio,
            alarmTime,
            __friendly_time: DateUtility.toDatetimeString(alarmTime, this.topLevelData.timezone, 'friendly'),
            version,
        };
    }

    async #saveAndReply(alarmId = this.subData.alarmId) {
        if (!this.subData.alarmId || !this.subData.alarmData) {
            unexpected('alarmId or alarmData is not set')
        }

        await this.#_save();
        await triggerAlarmAsync(this.belongTo.userId, this.subData.alarmId, this.subData.alarmData.version)
        await this.replyUntilAlarm(alarmId);
    }

    async #_save() {
        const alarmData = this.#generateAlarmData(this.subData.alarmData);  // for recalculate __friendly_time
        return this.db.doc(this.subData.alarmId).set(alarmData);
    }

    setAudio(filename) {
        const __ = this.translator;

        this.subData = {
            audio: filename,
            alarmTime: null,
            state: 'userSentAudio',
            /* db save related */
            alarmId: null,
            alarmData: null
        };
        this.replyText(__('reply.receivedAudio'));
        this.addQuickReply(
            new DatetimePicker('alarm-setter', __('label.pickATime')),
            new PostbackAction('alarm-setter,noThanks', __('label.noThanks')),
            // new PostbackAction('alarm-setter,editAlarms', __('label.editAlarms'))
        );
    }

    async loadEditWatch(alarmId, datetime) {  // load alarm, edit and save, and abort
        this.subData.alarmId = alarmId;
        this.subData.alarmData = (await this.db.doc(alarmId).get()).data();

        this.subData.alarmData.alarmTime = this.belongTo.parseDatetime(datetime);
        await this.#saveAndReply(alarmId);
        // await this.alarmOneAsync(alarmId);
        return this.belongTo.setHolder('alarm-watcher').generateQuickRepliesAsync();
    }

}

class LangSelector extends BaseDbUserChatBot {

    static NAME = register('lang-selector', this);

    ////////////////// CHATBOT REACTS /////////////////////

    async reactPostbackAsync(data, params) {
        const __ = this.translator;

        var prefix = 'lang-selector,';
        if (data.startsWith(prefix)) {
            const lang = data.slice(prefix.length);
            if (langs.includes(lang)) {
                this.#setLang(lang);
            } else {
                console.warn(`unknown lang ${lang}`);
            }
            return this.abort();
        }

        return super.reactPostbackAsync(...arguments);
    }

    /* --------------- CHATBOT SELF OWNED ------------------ */

    #setLang(lang) {
        const __ = this.translator;

        this.topLevelData.lang = lang;
        __.lang = lang;
        this.replyText(__('reply.chosenLang'));
    }

    changeLang() {
        // return this.setLang(this.stat.lang != 'zh' ? 'zh' : 'en');

        const __ = this.translator;

        this.replyText(__('reply.chooseLang'));
        for (const lang of langs) {
            var displayText = i18n.get(`lang.${lang}`);
            this.addQuickReply(
                new PostbackAction(`lang-selector,${lang}`, displayText)
            );
        }
    }

}

// @typedef description see https://jsdoc.app/tags-typedef.html
// or https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html#typedef-callback-and-param
/**
 * Possible chatbots.
 * @typedef {(DefaultChatBot & AlarmSetter & AlarmWatcher & AlarmDeleter & LangSelector)} ChatBotLike
 */

class DbUser {
    /**
     * @param {line.WebhookEvent} event
     */
    constructor(event) {
        this.event = event;
        this.userId = event.source.userId ?? unexpected('null userId');
        this.replyToken = event.replyToken;
        this.replies = [];
        this.quickReplies = [];
        this.__err_transform_count = 0;
    }

    // backgroundJobs = [];

    get db() {
        return db.collection('users').doc(this.userId);
    }

    #__;
    get translator() {
        if (!this.#__) {
            var userLang = this.dbData.lang ?? 'en';
            this.#__ = i18n.translate(userLang);
        }
        return this.#__;
    }

    /**
     * @returns {ChatBotLike}
     */
    get chatbot() {
        /* return chatbot by holder, null is deafult chatbot */
        return this.#getChatBot(this.dbData.holder ?? null);
    }
    #cachedBots = {};
    #getChatBot(name) {
        if (!this.#cachedBots[name]) {
            this.#cachedBots[name] = createChatBot(name, this);
        }
        return this.#cachedBots[name];
    }

    setHolder(name, clear = true) {
        this.__err_transform_count++;  /* accidentally infinite loop check */
        if (this.__err_transform_count > 100) {
            console.error('transform too many times!')
            console.error('is your program stuck?')
        }

        this.dbData.holder = name;
        if (clear) {
            /* TODO */
        }
        return this.chatbot;  // this.chatbot becomes new holder
    }

    /* ------- parseDatetime ------- */
    /**
     * @param {string} datetime
     * @returns {number} timestamp
     */
    parseDatetime(datetime) {
        /* datetime format look like 2017-12-25T01:00 */
        return DateUtility.parseDatetime(datetime, this.dbData.timezone);
    }
    toDatetimeString(timestamp) {
        return DateUtility.toDatetimeString(timestamp, this.dbData.timezone);
    }

    async save() {
        return await this.db.set(this.dbData);
    }

    async replyMessage() {
        var messages = this.replies.map(x => x.toLINEObject());
        if (this.quickReplies.length != 0) {
            if (messages.length == 0) {
                console.warn('no messages, cannot do quick reply');
            } else {
                messages[messages.length - 1].quickReply = {
                    items: this.quickReplies
                }
            }
        }
        console.log('reply messages', messages);
        if (messages.length == 0) {
            console.warn('no messages, nothing will be replied');
        }
        return client.replyMessage(this.replyToken, messages);
    }

    /* ------- onText, onAudio, onPostback ------- */

    async onText() {
        const event = this.event;

        var userText = event.message.text;
        var tag = null;  /* TODO tag */

        await this.chatbot.reactTextAsync(userText, tag);
        return this.replyMessage();
    }

    async onAudio() {
        const event = this.event;

        /* download audio */
        // TODO: send reply and download/upload simultaneously
        var duration = event.message.duration;
        var msgId = event.message.id;
        var filename = `${this.userId}/audio_${msgId}.m4a`;
        var stream = await client.getMessageContent(msgId);

        /* upload audio */
        await uploadStreamFile(stream, filename,
            {
                user: this.userId,
                audio: filename,
                duration: duration,
                __friendly_time: this.toDatetimeString(event.timestamp, this.dbData.timezone),
                alarmId: null,
                timestamp: this.timestamp
            }
        );

        /* reply message */
        await this.chatbot.reactAudioAsync(filename);
        return this.replyMessage();
    }

    async onPostback() {
        const event = this.event;
        console.log("onPostback", event.postback, "\n\n")

        await this.chatbot.reactPostbackAsync(event.postback.data, event.postback.params);
        return this.replyMessage();
    }

    async init() {  // called by startProcessing()
        /* the data in db if exists else empty obj */
        var userData = (await this.db.get()).data() ?? {};
        /** @type {ReturnType<typeof TopLevelData.default>} */
        this.dbData = applyDefault(userData, TopLevelData.default());
    }

    async startProcessing() {
        await this.init();

        const event = this.event;

        var userAction;
        if (event.type == 'message') {
            userAction = event.message.type;
        } else if (['postback'].includes(event.type)) {
            userAction = event.type;
        } else {
            return console.warn(`unhandled event type ${event.type}`)
        }

        /* onText, onAudio, onPostback */
        var key = 'on' + firstLetterCaptialize(userAction);
        if (key in this) {
            return this[key]();
        } else {
            return console.warn(`haven't implement ${key}() method yet`)
        }
    }
}

exports.LineMessAPI = functions.region(region).runWith(spec).https.onRequest(async (request, response) => {
    protocol = request.protocol;
    host = request.get('host');

    // decipher Webhook event sent by LineBot, that triggered by every user input

    // @type description https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html#type
    // line sdk types https://github.com/line/line-bot-sdk-nodejs/blob/master/lib/types.ts
    /** @type {line.WebhookRequestBody} */
    const body = request.body;

    try {
        console.log('\n\nevents length:', body.events.length);

        await createRichMenu();
        for (const event of body.events) {
            /* process webhook event now */

            var userObj = new DbUser(event);
            await userObj.startProcessing();

            // await originalProcessing(event, request, response);

            console.log('save storedData', userObj.dbData);
            await userObj.save();

            return response.status(200).send(request.method);

        }

    } catch (err) {
        if (err instanceof line.HTTPError) {
            /* it is line sdk error */
            console.error('line HTTPError', err.originalError.response.data);
        } else {
            console.error(err);
        }
        return response.sendStatus(400);  /* terminate processing */
    }

    return response.sendStatus(500);
});


/* if alarm will be triggered within 8 hr, run cloud task to trigger audio msg*/
exports.triggerAlarmInLINE = functions.region(region).runWith(spec).https.onRequest(async (request, response) => {
    protocol = request.protocol;
    host = request.get('host');
    const alarmId = request.query.alarmId
    const userId = request.query.userId
    const version = request.query.version
    console.log(`triggerAlarmInLINE`, request.query);

    /* getting audio_msg metadata */
    let doc = await db.collection('users').doc(userId).collection('alarms').doc(alarmId).get();

    const timer = doc.data().alarmTime

    let filename = doc.data().audio;
    let { metadata } = await getFileMetadata(filename);

    let audio_msg = {
        "to": userId,
        "messages": [
            new AudioMessage(await getPubUrl(filename), metadata.duration).toLINEObject()
        ]
    }

    /* create queue for a user, to store all his alarm triggers AKA cloud tasks */
    await AlarmTriggerManager.createCloudQueue(userId)

    /* 
    before creating task, 
    delete task to overwrite existing task

    NOTE: currently no API to update the existing task, so we have to resort to this
    */
    await AlarmTriggerManager.deleteCloudTask(userId, alarmId, version)
    /* create task to trigger alarm on time */
    url = 'https://api.line.me/v2/bot/message/push'
    await AlarmTriggerManager.createCloudTask(userId, alarmId, version, url, audio_msg, timer)

    return response.sendStatus(200)

})

class AlarmTriggerManager {
    static async createCloudQueue(userId) {

        const queue = `queue10-userId-${userId}`;

        var alrCreate = false

        // before creating new queue, list all existing queues
        const [queues] = await client_ct.listQueues({
            parent: client_ct.locationPath(project, region)
        });
        if (queues.length > 0) {
            console.log('Queues:');
            // check if this queue name has already existed
            for (const q of queues) {
                const pathToCheck = client_ct.queuePath(project, region, queue)
                if (q.name == pathToCheck) {
                    // if already exist, we remember this state to alrCreate variable
                    alrCreate = true
                    console.warn(pathToCheck, 'queue already exists!')
                }
            }
        } else {
            console.log('No queues found!');
        }

        // only create when the queue name doesn't already exist
        if (!alrCreate) {
            await client_ct.createQueue({
                parent: client_ct.locationPath(project, region),
                queue: {
                    name: client_ct.queuePath(project, region, queue),
                    appEngineHttpQueue: {
                        appEngineRoutingOverride: {
                            // The App Engine service that will receive the tasks.
                            service: 'default',
                        },
                    },
                },
            });
            console.log(`Created queue`);
        }

    }

    static async deleteCloudTask(userId, alarmId) {

        const queue = `queue10-userId-${userId}`;

        const [tasks] = await client_ct.listTasks({
            parent: client_ct.queuePath(project, region, queue)
        })

        for (let task of tasks) {
            let taskNameMatch = `${client_ct.queuePath(project, region, queue)}` + '/tasks/' + `${alarmId}-v`
            if (task.name.startsWith(taskNameMatch)) {
                await client_ct.deleteTask({ name: task.name })
                console.log(`Deleted task:`, task.name)
            }
        }
    }

    static async createCloudTask(userId, alarmId, version, url, audio_msg, timer) {

        const queue = `queue10-userId-${userId}`;

        const task = {
            name: `${client_ct.queuePath(project, region, queue)}` + '/tasks/' + `${alarmId}-v${version}`,
            httpRequest: {
                httpMethod: 'POST',
                url,
                body: Buffer.from(JSON.stringify(audio_msg)).toString('base64'),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer {${lineConfig.channelAccessToken}}`
                },
            },
            scheduleTime: {
                seconds: timer / 1000,
            }
        }

        const request = {
            parent: client_ct.queuePath(project, region, queue),
            task: task,
        };

        console.log('Sending task:');
        console.log(task);
        const [promiseArr1stData] = await client_ct.createTask(request);
        console.log(`
        Created task ${promiseArr1stData.name},
        for timer: ${DateUtility.toDatetimeString(timer, 8, 'friendly')}
        on queue:
        ${queue}`);
    }
}


exports.publicizeLocalFile = functions.region(region).runWith(spec).https.onRequest((request, response) => {
    console.log(`publicizeLocalFile: ${request.query}`);

    var filename = request.query.file;
    if (!filename) {
        response.sendStatus(404)
        return
    }
    response.setHeader('Content-Type', 'audio/mp4');

    (async () => {
        var file = bucket.file(filename)
        var [buffer] = await file.download()
        response.send(buffer)
    })().catch(err => {
        console.error(err);
        response.sendStatus(404)
    })
})

/////////////////////////////// LINE RICHMENU //////////////////////////////

async function createRichMenu() {
    // delete all richmenu, to update the new richmenu
    var richmenus = await client.getRichMenuList()
    for (let i = 0; i < richmenus.length; i++) {
        var rm = richmenus[i].richMenuId
        // console.log(rm)
        await client.deleteRichMenu(rm)
    }
    data = JSON.parse(fs.readFileSync('richmenu_data.json'))
    data2 = JSON.parse(fs.readFileSync('richmenu_framework.json'))
    data2.size.width = data["width"]
    data2.size.height = data["height"]
    data2.areas[0].bounds = data["bound0"]
    data2.areas[1].bounds = data["bound1"]
    data2.areas[2].bounds = data["bound2"]
    const richmenu = data2
    const richMenuId = await client.createRichMenu(richmenu)
    // console.log("richMenuId: " + richMenuId)
    await client.setRichMenuImage(richMenuId, fs.readFileSync(path.join(__dirname, "./richmenu.png")))
    await client.setDefaultRichMenu(richMenuId)
}

/////////////////////////////// FIREBASE AND CLOUDTASK DELETE //////////////////////////////

async function deleteDocWithIdx(belongTo, collectionName, id) {
    // to get first one, idx = 0
    /**
     * @param {DbUser} belongTo
     * @param {collectionName} string collection name u want to find
     * @param {idx} integer for indexing doc from collection
     */
    slot = `alarm_${id}`
    console.log(`deleting ${slot}`)
    await belongTo.db.collection(collectionName).doc(`${slot}`).delete()
    await AlarmTriggerManager.deleteCloudTask(belongTo.userId, slot)
}
