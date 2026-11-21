# 申し込みフォーム (moshikomi-form)

Web から氏名・メールアドレスで申し込みを受け付け、AWS 上の DB に保存し、申し込み完了時に
お礼(受付確認)のメールを自動送信するサンプル実装です。デザインはみずほ銀行をはじめと
した銀行系 Web フォームによく見られる「青基調 + 入力 → 確認 → 完了のステップ構成」を参考
にしています。

## 構成

```
moshikomi-form/
├── frontend/              静的フロントエンド (HTML / CSS / JS のみ、フレームワーク不要)
│   ├── index.html         入力・確認・完了の3ステップフォーム
│   ├── style.css          青基調のバンキング系デザイン
│   └── script.js          入力チェック・画面遷移・API 呼び出し
└── backend/               AWS SAM (サーバーレス) バックエンド
    ├── template.yaml      API Gateway / Lambda / DynamoDB の定義
    └── src/apply/
        ├── index.js       申し込み受付 Lambda (DynamoDB 保存 + SES 送信)
        └── package.json   ローカル動作確認用 (Lambda 実行環境に AWS SDK v3 が標準搭載のため本番デプロイには不要)
```

### アーキテクチャ

```
[ブラウザ] --POST /apply--> [API Gateway] --invoke--> [Lambda: ApplyFunction]
                                                            |         |
                                                      PutItem      SendEmail
                                                            v         v
                                                   [DynamoDB テーブル] [Amazon SES]
                                                                          |
                                                                   申込者へ受付確認メール
```

* **API Gateway + Lambda**: `POST /apply` で氏名・メールアドレスを受け取り、サーバー側でも
  入力チェックを行う。
* **DynamoDB**: `applicationId` (UUID) をキーに、氏名・メール・受付日時を保存。オンデマンド
  課金 (PAY_PER_REQUEST) のため、事前のキャパシティ設計は不要。
* **Amazon SES**: 受付確認メール (お礼メール) をテキスト/HTML 両形式で送信。

このセッションには AWS の認証情報が接続されていないため、実際のデプロイはユーザー自身の
AWS アカウントで行ってください。以下の手順通りに進めれば構築できます。

## 事前準備

1. AWS CLI と [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) をインストールし、`aws configure` で認証情報を設定しておく。
2. **SES の送信元メールアドレスを検証する**
   - AWS コンソール → Amazon SES → 「Identities」→ 「Create identity」で送信元に使うメール
     アドレス (例: `no-reply@example.com`) またはドメインを検証する。
   - SES が **サンドボックス状態** のデフォルトアカウントでは、送信元に加えて **受信者
     (申込者のメールアドレス)** も検証済みである必要があります。実際に不特定多数の申込者
     にメールを送るには、SES コンソールから「本番アクセス (Production access)」を申請して
     サンドボックスを解除してください。

## デプロイ手順

```bash
cd moshikomi-form/backend
sam build
sam deploy --guided
```

`sam deploy --guided` では以下を入力します。

| 項目 | 内容 |
| --- | --- |
| Stack Name | 任意 (例: `moshikomi-form`) |
| AWS Region | 使用するリージョン (例: `ap-northeast-1`) |
| Parameter SenderEmail | SES で検証済みの送信元メールアドレス |
| Parameter AllowedOrigin | フロントエンドの配信元ドメイン (未定なら `*` のままでも可、本番では必ず限定する) |

デプロイが完了すると、Outputs に `ApiEndpoint` (API の URL) が表示されます。

## フロントエンドの設定・公開

1. `frontend/script.js` の先頭にある `API_ENDPOINT` を、デプロイ後に出力された
   `ApiEndpoint` の値に書き換える。
2. `frontend/` 配下の `index.html` / `style.css` / `script.js` を、S3 の静的 Web ホスティング
   や CloudFront、他の任意のホスティングサービスにアップロードして公開する。
3. 本番公開前に、SAM の `AllowedOrigin` パラメータを公開ドメインに合わせて再デプロイする
   (CORS を特定ドメインに限定するため)。

## ローカルでの動作確認

```bash
# フロントエンドのみ確認する場合 (バックエンド未接続でも画面遷移は確認可能)
cd moshikomi-form/frontend
python3 -m http.server 8080
# http://localhost:8080 を開く

# バックエンドを sam local でエミュレートする場合
cd moshikomi-form/backend
sam local start-api
# frontend/script.js の API_ENDPOINT を http://127.0.0.1:3000/apply に変更して動作確認
```

## データの確認・削除

申し込みデータは DynamoDB テーブル (`<スタック名>-applications`) に保存されます。
AWS コンソールの DynamoDB → テーブル → 「項目を表示」で確認できます。

不要になった場合は、スタック全体を削除できます。

```bash
cd moshikomi-form/backend
sam delete
```

## セキュリティ・運用上の注意

* 本サンプルの入力チェックは最小限です。本番運用では reCAPTCHA 等によるボット対策や、
  API Gateway のスロットリング設定による連続送信対策も検討してください。
* メール本文に差し込む入力値は HTML エスケープ済みですが、保存される氏名・メールアドレス
  は個人情報です。DynamoDB の保存データには [保管時暗号化 (デフォルトで有効)] が適用され
  ますが、アクセス制御 (IAM) やログ出力に個人情報を含めない運用を徹底してください。
* `AllowedOrigin` パラメータは本番では必ず実際の配信ドメインに限定してください
  (デフォルトの `*` は開発・検証用です)。
