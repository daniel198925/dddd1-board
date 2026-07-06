const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });

// 初始化 Firebase
admin.initializeApp();

// 強制設定區域為台灣 (asia-east1)
setGlobalOptions({ region: "asia-east1" });

/**
 * 📌 功能一：刪除使用者 (包含 Auth 找不到帳號的防呆)
 */
exports.deleteUser = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send({ error: "只允許 POST" });
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).send({ error: "未授權" });
    const idToken = authHeader.split("Bearer ")[1];

    try {
      await admin.auth().verifyIdToken(idToken);
      const targetUid = req.body.data.uid;
      
      // 先試著刪除 Auth 帳號，找不到就忽略
      try {
        await admin.auth().deleteUser(targetUid);
      } catch (e) {
        if (e.code === 'auth/user-not-found') logger.warn("Auth 帳號已不存在，略過。");
        else throw e;
      }

      // 刪除資料庫個人檔案
      await admin.firestore().collection("users").doc(targetUid).delete();
      return res.status(200).send({ data: { success: true } });
    } catch (error) {
      logger.error("刪除失敗:", error);
      return res.status(500).send({ error: error.message });
    }
  });
});

/**
 * 📌 功能二：LINE 通知 (強化日誌與容錯版)
 */
exports.sendLineNotification = onDocumentCreated("records/{recordId}", async (event) => {
  // 從環境變數抓取金鑰，並加上 .trim() 防止隱形空格
  const token = (process.env.LINE_TOKEN || "").trim();
  const groupId = (process.env.LINE_GROUPID || "").trim();

  logger.info("--- [DEBUG] LINE 通知功能已觸發 ---");
  logger.info(`目標群組 ID: [${groupId}]`); // 加上中括號確認有沒有空格

  const snap = event.data;
  if (!snap) {
    logger.error("錯誤：找不到文件資料");
    return;
  }
  const data = snap.data();
  logger.info("偵測到新文章內容:", data.content ? data.content.substring(0, 20) : "無內容");

  if (!token || !groupId) {
    logger.error("❌ 錯誤：找不到 LINE_TOKEN 或 LINE_GROUPID 環境變數，請檢查 .env 檔案並重新部署。");
    return;
  }

  try {
    // 獲取作者暱稱
    let author = "系統";
    const userSnap = await admin.firestore().collection("users").doc(data.authorId).get();
    if (userSnap.exists) author = userSnap.data().nickname;

    const message = `📢 D1組公佈欄有新消息！\n\n發布者：${author}\n分類：${data.category}\n內容：\n${data.content}`;

    // 發送請求
    logger.info("正在請求 LINE API...");
    const res = await axios.post(
      "https://api.line.me/v2/bot/message/push",
      { 
        to: groupId, 
        messages: [{ type: "text", text: message }] 
      },
      { 
        headers: { 
          "Authorization": `Bearer ${token}`, 
          "Content-Type": "application/json" 
        } 
      }
    );
    logger.info("✅ 發送成功，回應狀態碼:", res.status);
  } catch (err) {
    if (err.response) {
      // 關鍵修改：將整個錯誤物件轉為字串印出來，才能看到 LINE 寫了什麼
      logger.error("❌ LINE API 報錯，具體原因：", JSON.stringify(err.response.data));
      logger.error("狀態碼：", err.response.status);
    } else {
      logger.error("❌ 連線失敗，請檢查網路或 Firebase Blaze 方案:", err.message);
    }
  }
  logger.info("--- [DEBUG] 流程結束 ---");
});

/**
 * 📌 功能三：Webhook (偷聽 ID)
 */
exports.lineWebhook = onRequest((req, res) => {
  logger.info("收到 LINE Webhook:", JSON.stringify(req.body));
  return res.status(200).send("OK");
});