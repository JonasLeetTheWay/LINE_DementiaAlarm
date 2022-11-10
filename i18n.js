
const printf = require('printf');

var i18nContent = require('./i18n.json');
try {
    /* merge data from i18n_trans.json */
    let i18n_trans = require('./i18n_trans.json');
    for (let key in i18n_trans) {
        if (!i18nContent.hasOwnProperty(key)) {
            i18nContent[key] = i18n_trans[key];
        }
    }
    // i18nContent.langs.push(...i18n_trans.langs);
} catch (e) {
    console.error(e);
}

function get(key) {
    return i18nContent[key];
}

exports.get = get;

exports.translate = function(lang) {
    var funcObj = function(tag, ...arg) {
        var key = `${tag}.${funcObj.lang}`;
        if (i18nContent.hasOwnProperty(key)) {
            var val = i18nContent[key];
            return arg.length == 0 ? val : printf(val, ...arg);
        }
        return key;
    }
    funcObj.lang = lang;
    funcObj.get = get;
    return funcObj;
}
