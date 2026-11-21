const { randomUUID } = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sesClient = new SESClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
    };
}

function respond(statusCode, payload) {
    return {
        statusCode,
        headers: corsHeaders(),
        body: JSON.stringify(payload),
    };
}

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildThankYouEmail(name, email, createdAt) {
    const text =
        `${name} 様\n\n` +
        'このたびはお申し込みいただき、誠にありがとうございます。\n' +
        '下記の内容で受け付けいたしました。\n\n' +
        '――――――――――――――――\n' +
        `お名前　　　　：${name}\n` +
        `メールアドレス：${email}\n` +
        `受付日時　　　：${createdAt}\n` +
        '――――――――――――――――\n\n' +
        '担当者より別途ご連絡させていただく場合がございます。\n' +
        '本メールにお心当たりのない場合は、恐れ入りますが破棄をお願いいたします。\n\n' +
        '※本メールは送信専用のため、ご返信いただいても対応できません。';

    const html = `
        <div style="font-family:'Noto Sans JP',sans-serif;color:#1a1a1a;line-height:1.7;">
            <p>${escapeHtml(name)} 様</p>
            <p>このたびはお申し込みいただき、誠にありがとうございます。<br>
            下記の内容で受け付けいたしました。</p>
            <table style="border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:4px 12px;color:#5a6472;">お名前</td><td style="padding:4px 12px;">${escapeHtml(name)}</td></tr>
                <tr><td style="padding:4px 12px;color:#5a6472;">メールアドレス</td><td style="padding:4px 12px;">${escapeHtml(email)}</td></tr>
                <tr><td style="padding:4px 12px;color:#5a6472;">受付日時</td><td style="padding:4px 12px;">${escapeHtml(createdAt)}</td></tr>
            </table>
            <p>担当者より別途ご連絡させていただく場合がございます。<br>
            本メールにお心当たりのない場合は、恐れ入りますが破棄をお願いいたします。</p>
            <p style="color:#888;font-size:12px;">※本メールは送信専用のため、ご返信いただいても対応できません。</p>
        </div>`;

    return { text, html };
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return respond(200, {});
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return respond(400, { message: 'リクエストの形式が正しくありません。' });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!name || name.length > 50) {
        return respond(400, { message: 'お名前を正しく入力してください。' });
    }
    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
        return respond(400, { message: 'メールアドレスを正しく入力してください。' });
    }

    const applicationId = randomUUID();
    const createdAt = new Date().toISOString();

    try {
        await ddbClient.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: { applicationId, name, email, createdAt },
            })
        );
    } catch (err) {
        console.error('DynamoDB put failed', err);
        return respond(500, { message: 'サーバーエラーが発生しました。しばらくしてから再度お試しください。' });
    }

    const { text, html } = buildThankYouEmail(name, email, createdAt);

    try {
        await sesClient.send(
            new SendEmailCommand({
                Source: SENDER_EMAIL,
                Destination: { ToAddresses: [email] },
                Message: {
                    Subject: { Data: '【お申し込み受付】ご登録ありがとうございます', Charset: 'UTF-8' },
                    Body: {
                        Text: { Charset: 'UTF-8', Data: text },
                        Html: { Charset: 'UTF-8', Data: html },
                    },
                },
            })
        );
    } catch (err) {
        console.error('SES send failed', err);
        return respond(200, {
            message: 'お申し込みを受け付けました。確認メールの送信に失敗しましたが、担当者が内容を確認いたします。',
            applicationId,
        });
    }

    return respond(200, {
        message: 'お申し込みを受け付けました。確認メールをご確認ください。',
        applicationId,
    });
};
