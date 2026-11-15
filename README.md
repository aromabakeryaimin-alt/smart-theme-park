# Smart Theme Park 2.0 — Firebase starter

## 新版票務規則

### 手機購票
- 手機購票頁目前只建立 `pending_payment` 訂單。
- 付款供應商尚未接入，所以不會收款、不會生成有效 QR Code。
- 日後必須由已驗證的付款 webhook 確認付款後，伺服器才生成 QR token 及 `entryMethod: "qr"` 門票。
- 手機票不登記人臉。

### 現場櫃檯購票
- 員工收妥現金後，透過指定人臉供應商登記遊客。
- 門票只綁定已由供應商驗證的 enrollment reference，不生成 QR Code。
- 本 starter 沒有選定人臉供應商，故出票 callable 預設 fail-closed，不能把普通照片或前端 `faceVerified=true` 當成識別成功。
- 正式接入需實作 server-to-server enrollment 驗證、活體檢測、比對、撤回同意、刪除及保留政策。

## Admin 合一入口
- `/admin.html` 是唯一員工/管理員登入入口。
- 登入只需員工編號及密碼。
- 首次初始化最高管理員：使用頁面中的「首次設定最高管理員」區域。
- 初始化需要 `BOOTSTRAP_SECRET` 及 `BOOTSTRAP_ENABLED=true`，完成後立即關閉並重新部署。
- 最高管理員可建立員工帳戶並分配 `counter`、`gate`、`supervisor`、`finance`、`admin` 角色。
- 密碼由 Firebase Authentication 管理，不存入 RTDB。

## 部署

1. 建立全新 Firebase 專案並啟用 Realtime Database、Authentication Email/Password。
2. 建立 Web App，填入 `public/js/firebase-config.js`。
3. 安裝 Node.js 20+、Firebase CLI，登入並選擇新專案：
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```
4. Functions 需 Blaze 方案及計費帳戶。設定 Functions secret：
   ```bash
   firebase functions:secrets:set BOOTSTRAP_SECRET
   ```
   輸入至少 32 字元隨機密鑰。
5. 在 `functions/` 目錄建立 `.env.smart-theme-park`（檔名中的專案 ID 必須與 Firebase 專案 ID 一致），內容設 `BOOTSTRAP_ENABLED=true`。部署並建立最高管理員後改為 `false` 再重新部署。`BOOTSTRAP_SECRET` 仍使用 Firebase Functions Secret 管理。
6. 部署：
   ```bash
   firebase deploy --only database
   firebase deploy --only functions,hosting
   ```

## 安全提醒
- 不要把 Admin SDK 私鑰放入網站或 GitHub。
- 建議加上 Firebase App Check、速率限制、備份、監控及管理員 MFA。
- 人臉屬高度敏感生物識別資料。上線前需完成個資影響評估、明確同意、替代入園方式、加密、最少保留、刪除及供應商合約審查。
- 票券 QR token 必須高熵、只存雜湊、一次性 transaction 核銷。
- 現金付款確認需保留員工及稽核紀錄。
