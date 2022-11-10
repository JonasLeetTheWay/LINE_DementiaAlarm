class DatetimePicker {
    constructor(data, label, options = {}) {
        this.data = data;    // line will reject empty string
        this.label = label
        this.mode = 'datetime';
        this.options = options;
    }

    toLINEObject() {  // return Action object
        return {
            type: 'datetimepicker',
            data: this.data,
            label: this.label,
            mode: this.mode,
            ...this.options
        };
    }

}

class PostbackAction {
    constructor(data, label, options = {}) {
        this.data = data;    // line will reject empty string
        this.label = label
        this.options = options;
    }

    toLINEObject() {  // return Action object
        return {
            type: 'postback',
            data: this.data,
            label: this.label,
            ...this.options
        };
    }

}

/* CHATBOT replies */
class TextMessage {
    constructor(text) {
        this.text = text;
    }

    toLINEObject() {  // return Message object
        return {
            type: 'text',
            text: this.text,
        };
    }

}

class AudioMessage {
    constructor(url, duration) {
        this.url = url;
        this.duration = duration;
    }

    toLINEObject() {
        return {
            type: "audio",
            originalContentUrl: this.url,
            duration: this.duration
        }
    }
}

class FlexMessage {
    constructor(flex, altText = 'this is a flex message') {
        this.flex = flex;
        this.altText = altText;
    }

    toLINEObject() {  // return Message object
        return {
            type: 'flex',
            altText: this.altText,
            contents: this.flex,
        };
    }

}

class ImageCarousel {
    constructor(flexArr, altText = 'your alarms') {
        console.log("imagecouresel flexArr:", flexArr)
        this.flexArr = flexArr;
        this.altText = altText;
        var flexObjs = []
        for (const flex of this.flexArr) {
            console.log("imagecouresel flex:", flex)
            flexObjs.push(flex)
        }
        this.flexObjs = flexObjs
        console.log("this.flexObjs:\n", this.flexObjs)
    }

    toLINEObject() { // return Message object
        return {
            "type": "carousel",
            "contents": this.flexObjs
        }
    }
}

module.exports = {DatetimePicker,PostbackAction,TextMessage,AudioMessage,FlexMessage,ImageCarousel}