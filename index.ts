import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";

import creds from "./creds.json" assert {"type": "json"};

let browser: Browser;
let page: Page;

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('uncaughtException', (error, origin) => {
    console.log(`Uncaught exception: ${error}, origin: ${origin}`);
});

console.log("Starting puppeteer");
browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

// load cookies
if (fs.existsSync("./cookies.json")) {
    const cookiesString = fs.readFileSync('./cookies.json').toString();
    const cookies = JSON.parse(cookiesString);
    await page.setCookie(...cookies);
    console.log("Loaded cookies");
}

console.log("Puppeteer started");

await page.goto("https://mano.vilniustech.lt", { waitUntil: "networkidle2" });
// wait for redirects
await sleep(10000);

console.log(`Loaded mano.vilniustech`);

// check if we need to log in
if (await page.evaluate(() => document.querySelector("#password"))) {
    await page.type("#username", creds.username);
    await page.type("#password", creds.password);
    await page.click("[type=\"submit\"]");

    await sleep(3000);
    console.log(`Logged in`);
} else {
    console.log(`No need to login`);
}

// check if "Consent about releasing personal information" exists
if (await page.evaluate(() => document.querySelector("#acceptance"))) {
    await page.evaluate(() => {
        (document.querySelector("#acceptance") as HTMLElement).click();
        setTimeout(() => {
            (document.querySelector("#yesbutton") as HTMLElement).click();
        }, 1000);
    });
    await sleep(3000);
    console.log(`Accepted consent`);
} else {
    console.log(`No need to accept consent`);
}

// save cookies
const cookies = await page.cookies();
fs.writeFileSync('./cookies.json', JSON.stringify(cookies, null, 2));
console.log("Saved cookies");

// wait for main page to load
await page.waitForSelector(".main_logo");

// call timetable endpoint
await page.goto("https://mano.vilniustech.lt/timetable/site/my-timetable");

const timetable = await page.$eval('*', (el) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(el);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return window.getSelection()?.toString();
});

if (fs.existsSync("./timetable.txt")) {
    if (fs.readFileSync("./timetable.txt").toString() != timetable) {
        await fetch('https://ntfy.sh/mano_vilniustech_timetable_changed', {
            method: 'POST',
            body: 'Update google calendar accordingly',
            headers: { 'Tags': 'warning,orange_square', 'Title': 'Vilniustech timetable changed' }
        })
    } else {
        await fetch('https://ntfy.sh/mano_vilniustech_timetable_changed', {
            method: 'POST',
            body: 'All good',
            headers: { 'Tags': 'green_square', 'Title': 'Vilniustech timetable scrub done' }
        })
    }
}

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

if(timetable) {
    fs.writeFileSync('./timetable.txt', timetable);

    const searchStr = "Lecture\tTime\tWeek\tSubgroup\tSubject\tAuditorium\tLecturer\tType";
    const indexes = [...timetable.matchAll(new RegExp(searchStr, 'gi'))].map(a => a.index);

    let i: number = 0;
    for(const index of indexes) {
        const last_index = timetable.indexOf("\\n", index);
        const sub_timetable = timetable.substring(index! + searchStr.length, last_index).trim();
        const sub_timetable_entries_sep = sub_timetable.split("\n");
        let sub_timetable_entries = [];
        for(let i = 0; i < sub_timetable_entries_sep.length; i+= 3) {
            sub_timetable_entries.push(
                sub_timetable_entries_sep[i].trim() + "\t" + 
                sub_timetable_entries_sep[i + 1].trim() + "\t" + 
                sub_timetable_entries_sep[i + 2].trim());
        }
        let sub_timetable_subjects = [];
        for(const entry of sub_timetable_entries) {
            sub_timetable_subjects.push(entry.split("\t"));
        }
        console.log(days[i]);
        console.log(sub_timetable_subjects);
        i++;
    }

}

console.log("DONE");
process.exit(0);
