
const printf = require('printf');

function alarmScheduledJSON_large(emoji, lbs, time, suf, date, alarmId) {
    let i = 0;
    return {
        "type": "bubble",
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": `${emoji} ${lbs[i++]}`,  // 🕒 ALARM
                                    "size": "xl",
                                    "weight": "bold",
                                    "color": "#1DB446",
                                    "align": "end"
                                },
                                {
                                    "type": "text",
                                    "text": lbs[i++], // AUDIO MESSAGE
                                    "size": "xxs",
                                    "color": "#aaaaaa",
                                    "align": "end"
                                }
                            ],
                            "spacing": "none",
                            "justifyContent": "space-evenly",
                            "flex": 0
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": []
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "size": "xxl",
                                    "weight": "bold",
                                    "align": "end",
                                    "contents": [
                                        {
                                            "type": "span",
                                            "text": time  // 09:28
                                        },
                                        {
                                            "type": "span",
                                            "text": " ",
                                            "size": "sm"
                                        },
                                        {
                                            "type": "span",
                                            "text": suf,  // PM
                                            "size": "xl"
                                        }
                                    ]
                                },
                                {
                                    "type": "text",
                                    "text": date,  // JUN 7, 2022
                                    "size": "xs",
                                    "color": "#aaaaaa",
                                    "align": "end"
                                }
                            ],
                            "flex": 0
                        }
                    ],
                    "spacing": "none",
                    "margin": "none"
                }
            ],
            "margin": "none",
            "paddingBottom": "none"
        },
        "footer": {
            "type": "box",
            "layout": "horizontal",
            "contents": [
                {
                    "type": "button",
                    "action": {
                        "type": "datetimepicker",
                        "mode": "datetime",
                        "label": lbs[i++], // EDIT
                        "data": `flex,edit=${alarmId}`
                    },
                    "height": "sm"
                },
                {
                    "type": "button",
                    "action": {
                        "type": "postback",
                        // "displayText": lbs[i],
                        "label": lbs[i++], // VIEW ALARMS
                        "data": `flex,view=${alarmId}`
                    },
                    "height": "sm",
                    "flex": 0
                }
            ]
        }
    }
}

function alarmScheduledJSON_small(emoji, lbs, time, suf, date, alarmId) {
    let i = 0;
    return {
        "type": "bubble",
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "size": "xxl",
                                    "weight": "bold",
                                    "align": "end",
                                    "contents": [
                                        {
                                            "type": "span",
                                            "text": `${emoji}`,  // 09:28
                                            "size": "xxl"
                                        },
                                        {
                                            "type": "span",
                                            "text": ` ${time}`,  // 09:28
                                            "size": "xxl"
                                        },
                                        {
                                            "type": "span",
                                            "text": " ",
                                            "size": "sm"
                                        },
                                        {
                                            "type": "span",
                                            "text":  suf,  // PM
                                            "size": "xs"
                                        }
                                    ]
                                },
                                {
                                    "type": "text",
                                    "text": date,  // JUN 7, 2022
                                    "size": "xs",
                                    "color": "#aaaaaa",
                                    "align": "end"
                                }
                            ],
                            "alignItems": "center"
                        }
                    ],
                    "spacing": "none",
                    "margin": "none"
                }
            ],
            "margin": "none",
            "paddingBottom": "none"
        },
        "footer": {
            "type": "box",
            "layout": "horizontal",
            "contents": [
                {
                    "type": "button",
                    "action": {
                        "type": "datetimepicker",
                        "mode": "datetime",
                        "label": lbs[i++], // EDIT
                        "data": `flex,edit=${alarmId}`
                    },
                    "height": "sm"
                }
            ]
        },
        "size": "micro"
    }
}

function emojiClock(__, hr) {  // hr can be decimals
    // n-th emoji see https://stackoverflow.com/questions/24531751/how-can-i-split-a-string-containing-emoji-into-an-array
    const emojis = [...__.get('emoji.clock')];
    /* [0] is 0100, [1] is 0130, [2] is 0200 and so on */
    return emojis[(((hr + 12 - 1) * 2 + .5) << 0) % 24];
}

function timeString(__, d) {
    // TODO: translate time
    /*  by wiki, 24-hr 00:00 -> 12-hr 12:00 AM, (but I like 00:00 AM)
                       12:00 -> 12-hr 12:00 PM, (this is ok)

    */
    let hr = d.getUTCHours();
    let min = d.getUTCMinutes();
    let suf = hr >= 12 ? 'PM' : 'AM';
    if (hr > 12) hr -= 12;  // 12 is unchanged
    return [printf('%02d:%02d', hr, min), suf];
}

function dateString(__, d) {
    // TODO: translate date
    /* [...Array(12).keys()].map(i => new Date(0, i).toLocaleDateString('jp',
        {month: 'short'}).toUpperCase())

    */
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return printf('%s %s, %s', months[d.getUTCMonth()], d.getUTCDate(), d.getUTCFullYear());
}

exports.alarmScheduled = function (__, timestamp, timezone, alarmId, scale) {
    console.log('alarmScheduled', timestamp, timezone)
    timestamp += timezone * 3600 * 1000;
    let d = new Date(timestamp);

    let hr = d.getUTCHours() + d.getUTCMinutes() / 60;
    let emoji = emojiClock(__, hr);

    let lbs = [];
    
    if (scale == 'small'){
        lbs.push(__(`flex.alarm.lb_${3}`));
        var flex = alarmScheduledJSON_small(emoji, lbs, ...timeString(__, d), dateString(__, d), alarmId);
    } else {
        for (let i = 1; i <= 4; i++) {
            lbs.push(__(`flex.alarm.lb_${i}`));
        }
        var flex = alarmScheduledJSON_large(emoji, lbs, ...timeString(__, d), dateString(__, d), alarmId);
    }
    
    // console.log('flex', JSON.stringify(flex));
    return flex;
}
