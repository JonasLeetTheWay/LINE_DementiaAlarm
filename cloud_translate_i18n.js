
/*

See cloud_translate_demo.json for the instruction of API Credentials.

*/

require('dotenv').config({ path: '.env.gcloud' })

const { Translate } = require('@google-cloud/translate').v2;

const projectId = process.env.PROJECT_ID;

// Instantiates a client
const translate = new Translate({ projectId });

/*

V8 javascript engine preserved object keys in insertion order as long as
they are not integral keys, and object has integral keys ordered like this:

{ ...[sorted integral keys]: XXX, ...[non integral keys]: XXX }

for example:

JSON.stringify(JSON.parse('{"c":true,"3":true,"b":true,"2":true,"a":true,"1":true}'))
-> '{"1":true,"2":true,"3":true,"c":true,"b":true,"a":true}'

if you see the output json object keys ordered in the way that not you want,
then we may consider to use a npm module that read/write jsons with preserve
keys order functionality

*/

const fs = require('fs');

var i18nContent = require('./i18n.json');

const outFilename = './i18n_trans.json';
const outFilename_alt = './i18n_trans_alt.json';

const sourceLang = 'en';

const targetLangs = [
    'zh-TW',
    'ja',
    'de',
    'ms',
];

async function getLanguages(langOfName) {
    const ret = {};
    const [languages] = await translate.getLanguages(langOfName);
    for (l of languages) {
        ret[l.code] = l.name;
    }
    return ret;
}

async function main() {
    const header = [];
    /* generate like "lang.ko.en": "Korean" */
    {
        let names = await getLanguages(sourceLang);
        for (let lang of targetLangs) {
            header.push({
                key: `lang.${lang}.${sourceLang}`,
                value: names[lang],
            });
        }
    }
    /* generate like "lang.ko": "한국어" */
    {
        for (let lang of targetLangs) {
            let names = await getLanguages(lang);
            header.push({
                key: `lang.${lang}`,
                value: names[lang],
            });
        }
    }
    /* just console.log */
    {
        for (let o of header) {
            console.log(o.key, ':', o.value);
        }
    }
    /* generate the langs array */
    {
        header.push({
            key: "langs",
            value: [...targetLangs],
        });
    }
    const body = [];
    const tags = [];  // all tags except lang.xx
    const contents = [];  // tag contents
    /* list tags */
    {
        for (let key of Object.keys(i18nContent)) {
            if (key.startsWith('lang.')) {
                continue;
            }
            let suf = `.${sourceLang}`;
            if (key.endsWith(suf)) {
                tags.push(key.slice(0, -suf.length));
                contents.push(i18nContent[key]);
            }
        }
    }
    console.log('tags length', tags.length);
    /* do translation jobs */
    {
        for (let lang of targetLangs) {
            console.log(`translating ${lang}...`);
            /* pseudo translate */
            // let translated = [...contents];
            /* real translate */
            let [translated] = await translate.translate(contents, lang);
            for (let i = 0; i < tags.length; i++) {
                let tag = tags[i];
                let text = translated[i];
                body.push({
                    key: `${tag}.${lang}`,
                    value: text,
                });
            }
            console.log(`translate ${lang} done`);
        }
    }

    /* do group body and save */
    let tagLookup = {};
    let langLookup = {};
    /* create lookup indexes */
    {
        for (let i in tags) {
            tagLookup[tags[i]] = i;
        }
        for (let i in targetLangs) {
            langLookup[targetLangs[i]] = i;
        }
    }

    // function strcmp(a, b) {
    //     // https://stackoverflow.com/questions/1179366/is-there-a-javascript-strcmp
    //     return a < b ? -1 : +(a > b);
    // }

    function tagLang(key) {
        let i = key.lastIndexOf('.');
        if (i < 0) throw 'why?';
        let tag = tagLookup[key.slice(0, i)];
        let lang = langLookup[key.slice(i + 1)];
        return [tag, lang];
    }

    /* group body by tag, save to outFilename */
    body.sort((a, b) => {
        let [tag1, lang1] = tagLang(a.key);
        let [tag2, lang2] = tagLang(b.key);
        let c = 0;

        c = tag1 - tag2;
        if (c != 0) return c;
        return lang1 - lang2;
    });
    save(header, body, outFilename);

    /* group body by lang, save to outFilename_alt */
    body.sort((a, b) => {
        let [tag1, lang1] = tagLang(a.key);
        let [tag2, lang2] = tagLang(b.key);
        let c = 0;

        c = lang1 - lang2;
        if (c != 0) return c;
        return tag1 - tag2;
    });
    save(header, body, outFilename_alt);
}

function save(header, body, filename) {
    let obj = {};
    for (let pair of header) {
        obj[pair.key] = pair.value;
    }
    for (let pair of body) {
        obj[pair.key] = pair.value;
    }
    fs.writeFileSync(filename, JSON.stringify(obj, null, 4));
    console.log(`save to ${filename} done`);
}

main();
