import {Input, Markup, Telegraf} from 'telegraf';
import {message} from 'telegraf/filters';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import convertBody from 'fetch-charset-detection';

// noinspection JSUnresolvedReference
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.on(message('text'), async (ctx) => {
    console.log(ctx.message);
    if (ctx.message.reply_to_message) {
        let piva = ctx.message.reply_to_message.caption.match(/^piva=(.+)$/m)[1];
        let jsessionid = ctx.message.reply_to_message.caption.match(/^session=(.+)$/m)[1];

        let url = 'https://telematici.agenziaentrate.gov.it/VerificaPIVA/VerificaPiva.do';
        let response = await fetch(url, {
            method: 'POST',
            headers: {
                'Cookie': `JSESSIONID=${jsessionid}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `piva=${piva}&inCaptchaChars=${ctx.message.text}`
        });

        if (!response.ok) {
            await ctx.reply('Errore');
            return;
        }

        const buf = await response.arrayBuffer();
        const html = convertBody(buf, response.headers);

        const $ = cheerio.load(html);

        let errorContainer = $('#vcfcontenitore .errore_txt');
        if (errorContainer.length) {
            let text = $('.errNoVerifica', errorContainer).text().trim() + '\n\n';
            for (let item of $('li', errorContainer)) {
                text += '- ' + $(item).text().trim() + '\n';
            }
            await ctx.reply(text);
            return;
        }

        const paragraphs = $('#vcfcontenitore p').slice(0, 5);
        let text = '';
        for (let paragraph of paragraphs) {
            let content = $(paragraph).text().trim();
            if (content) {
                text += content + '\n\n';
            }
        }

        await ctx.reply(text);
    } else {
        let piva = ctx.message.text.trim();

        if (piva.startsWith('IT')) {
            piva = piva.slice(2);
        }

        if (!piva.match(/^[0-9]{11}$/)) {
            await ctx.reply('La partita IVA non è valida: deve essere di 11 cifre numeriche, opzionalmente con `IT` all\'inizio.');
            return;
        }

        let captchaUrl = 'https://telematici.agenziaentrate.gov.it/VerificaPIVA/captcha?type=i';
        let response = await fetch(captchaUrl);

        let cookie = response.headers.get('Set-Cookie');
        let jsessionid = cookie.match(/JSESSIONID=(.*?);/)[1];

        await ctx.replyWithPhoto(Input.fromReadableStream(response.body), {
            caption: `Risolvi il captcha rispondendo a questo messaggio.\n\npiva=${piva}\nsession=${jsessionid}`,
            ...Markup.forceReply()
        });
    }
});

export default async function handler(request, response) {
    await bot.handleUpdate(request.body);
    response.status(200).end();
}