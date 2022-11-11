const fs = require('fs');
var readline = require('readline');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function savePrompt(promptMsg) {
  return new Promise((resolve, reject) => {
    rl.question(promptMsg, resolve);
    // rl.question(q, (answer) => {
    //     resolve(answer);
    // })
  })
}

/* parse data into json to edit */
let data_raw = fs.readFileSync('i18n_trans.json', 'utf-8')
let data_json = JSON.parse(data_raw)

async function main() {
  for (let key in data_json) {
    let val = data_json[key]
    /* when label length > 20, LINE cannot process */
    while (key.startsWith("label") && data_json[key].length > 20) {
      console.error(key,':',val,data_json[key].length)
      /* prompt user to input a new label */
      let val_new = await savePrompt(`chars > 20 , please rewrite:\n`);
      data_json[key] = val_new
    }
  }
  /* write corrected data into json */
  fs.writeFileSync('i18n_trans.json', JSON.stringify(data_json, null, 4), 'utf-8')
  rl.close()
}

main()


