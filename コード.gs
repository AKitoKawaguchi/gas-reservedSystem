var channel_token = "MOAdCgT8iE6U/2SeTi1KHngteOTRyzxQihvNiqXygQGJDOZ/mI/FZS/tVcelEPtfcArX7u1JImYAzsa26M6Pi3pVg5CBSilnvn6d3JRdrr0mypgdMkjXBZPy9Cw2ZYXly3IUsxdirGX0qtHvrVYBwQdB04t89/1O/w1cDnyilFU=";
var url = "https://api.line.me/v2/bot/message/reply";

var sheet = SpreadsheetApp.openById("1RcTUPC_zPT0Q-RqjEkofse2stmUNmnakAp67Vn1bvzY");

var sheetname = sheet.getSheetByName("data");

var dayExp = /(\d+)[\.\/月](\d+)/;
var hourMinExp = /(\d+)[:時](\d+)*/;
var phoneExp = /^(0[5-9]0[-(]?[0-9]{4}[-)]?[0-9]{4}|0120[-]?\d{1,3}[-]?\d{4}|050[-]?\d{4}[-]?\d{4}|0[1-9][-]?\d{1,4}[-]?\d{1,4}[-]?\d{4})*$/

function doPost(e){
  try{
    handleMessage(e);
  }catch(error){
    logging("ToCalendarFromLineBot");
    logging(JSON.stringify(e));
    logging(JSON.stringify(error));
    var replyToken = JSON.parse(e.postData.contents).events[0].replyToken;
    reply(replyToken, error.message);
  }
}

function logging(str) {
  sheetname.appendRow([str]);
}

function handleMessage(e){
  var replyToken = JSON.parse(e.postData.contents).events[0].replyToken;
  var lineType = JSON.parse(e.postData.contents).events[0].type;
  if(typeof replyToken === "undefined" || lineType === "follow"){
    return;
  }

  var userMessage = JSON.parse(e.postData.contents).events[0].message.text;
  var cache = CacheService.getScriptCache();
  var type = cache.get("type");

  if(type === null){
    if(userMessage === "予約"){
      cache.put("type",1)
      reply(replyToken,"日にちを教えてください！\n例：5/3, 5.3, 5月3日\nこのセッションは6時間で切れてしまいます")
    }else if (userMessage === "空席確認") {
      replylink(replyToken, "空席確認のリンク", "https://script.google.com/macros/s/AKfycbybt1SpNIhL3CMLRgfQ2E6b0OPNE4zpaztOyiupGUk2UG2wfAEja50COKeXM7f2cPr_/exec", "空席を確認する")
    }else {
      reply(replyToken, "リッチメニューの「予約」で予約追加を、「空席確認」で一週間の空席確認ができるので気軽に話しかけてくださいね！");
    }
  }else {
    if (userMessage === "キャンセル") {
      cache.remove("type");
      reply(replyToken, "キャンセルしました！");
      return;
    }
  
  switch(type) {
      case "1":
        // 予定日
        if (userMessage.match(dayExp)){
          var [matched, month, day] = userMessage.match(dayExp); //dayexpの型に合う文字列を取り出す。
          cache.put("type", 2);
          cache.put("month", month);
          cache.put("day", day);
          reply(replyToken, month + "/" + day + "ですね！\n次に開始時刻を教えてください。指定できる時間帯は18:00から22:00までの30分刻みでのご予約が可能です！");
        }else{
          reply(replyToken, "申し訳ありません。\n形式に誤りがないか確認してみて、なければ「キャンセル」で予定入力をキャンセルすることができるので、そちらを試していただけますか？");
        }
        break;

      case "2":
        // 開始時刻
        if (userMessage.match(hourMinExp)){
          var [matched, startHour, startMin] = userMessage.match(hourMinExp);
          if(startHour <=17 || (startHour == 22 && startMin == 30) || startHour >= 23){
            reply(replyToken, "予約をお取りできる時間帯は18::00~22:00となっております。時間帯を変更の上、もう一度お願いできますか？");
          }else{
            cache.put("type", 3);
            cache.put("start_hour", startHour);
            if (startMin == null) startMin = "00";
            cache.put("start_min", startMin);
            reply(replyToken, startHour + ":" + startMin + "ですね！\n次に予約人数を教えてください。");
          }
        }else{
          reply(replyToken, "申し訳ありません。\n形式に誤りがないか確認してみて、なければ「キャンセル」で予定入力をキャンセルすることができるので、そちらを試していただけますか？");
        }
        break;

      case "3":
        // 予約人数
        var [matched,number] = userMessage.match(/(\d+)/);
        cache.put("type", 4);
        cache.put("number", number);
        reply(replyToken, number + "人ですね!\n次にお名前を教えてください");
        break;

      case "4":
        // 名前
        cache.put("type", 5);
        cache.put("username", userMessage);
        reply(replyToken, userMessage + "様ですね！\n次にお電話番号を教えてください。\n例:000-0000-0000");
        break;

      case "5":
        // 予約人数
        if (userMessage.match(phoneExp)){
          var [matched, phone] = userMessage.match(phoneExp);
          cache.put("type", 6);
          cache.put("phone", phone);
          var [number, startDate, username, phone] = createEventData(cache);
          replybuttons(replyToken, toEventFormat(number, startDate, username, phone));
        }else{
          reply(replyToken, "申し訳ありません。\n形式に誤りがないか確認してみて、なければ「キャンセル」で予定入力をキャンセルすることができるので、そちらを試していただけますか？")
        }
        break;
        
      case "6":
        // 確認の回答がはい or いいえ
        cache.remove("type");
        if (userMessage === "はい") {
          var [number, startDate, username, phone] = createEventData(cache);
          var indexoftime = getAllRecords();
          var today = new Date();
          if(arrayIncludes2D(indexoftime,[cache.get("day") - today.getDate(),(cache.get("start_hour")-18)*2 + (cache.get("start_min")/30),cache.get("number")]) || arrayIncludes2D(indexoftime,[cache.get("day") - today.getDate(),(cache.get("start_hour")-18)*2 + (cache.get("start_min")/30) + 1,cache.get("number")]) || arrayIncludes2D(indexoftime,[cache.get("day") - today.getDate(),(cache.get("start_hour")-18)*2 + (cache.get("start_min")/30) + 2,cache.get("number")]) || arrayIncludes2D(indexoftime,[cache.get("day") - today.getDate(),(cache.get("start_hour")-18)*2 + (cache.get("start_min")/30) + 3,cache.get("number")])){
            reply(replyToken, "ご指定の時間帯は他の予約で埋まっております。申し訳ございませんが、他の時間帯をご指定してください！");
          }else{
            var endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startDate.getHours() + 2, startDate.getMinutes())
            CalendarApp.getDefaultCalendar().createEvent("飲み", startDate, endDate);
            sheetname.appendRow(createSpreadSheet(cache));
            reply(replyToken, "予約が完了しました！\n当日はお待ちしております!");
          }
        } else {
          reply(replyToken, "お手数ですがもう一度お願いいたします！");
        }
        break;
    }
  }
}

function createEventData(cache) {
  var year = new Date().getFullYear();
  var number = cache.get("number");
  var startDate = new Date(year, cache.get("month") - 1, cache.get("day"), cache.get("start_hour"), cache.get("start_min"));
  var username = cache.get("username");
  var phone = cache.get("phone");
  return [number, startDate, username, phone];
}

function createSpreadSheet(cache){
  var day = cache.get("month") + "/" + cache.get("day");
  var st = cache.get("start_hour") + ":" + cache.get("start_min");
  var number = cache.get("number");
  var username = cache.get("username");
  var phone = cache.get("phone");
  return [day, st, number, username, phone];
}

function toEventFormat(title, startDate, username, phone) {
  var start = Utilities.formatDate(startDate, "JST", "HH:mm");
  var endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startDate.getHours() + 2, startDate.getMinutes())
  var end = Utilities.formatDate(endDate, "JST", "HH:mm");
  var username = username;
  var phone = phone;
  var str = "予約人数：" + title + "名\n時間：" + (Number(startDate.getMonth()) + 1) + "月" + startDate.getDate() + "日" + start + " ~ " + end +"\nお名前：" + username + "様" + "\n電話番号：" + phone;
  return str;
}

function doGet(e) {
  const indexoftime = getAllRecords();
  const template = HtmlService.createTemplateFromFile('index');
  template.deployURL = ScriptApp.getService().getUrl();
  template.formHTML = getFormHTML(e, indexoftime);
  const htmlOutput = template.evaluate();
  return htmlOutput;
}

function getAllRecords() {
  const values = sheetname.getDataRange().getDisplayValues();
  const labels = values.shift();
  

  const records = [];
  for(const value of values) {
    const record = {};
    labels.forEach((label, index) => {
      record[label] = value[index];      
    });
    records.push(record);
  }

  var date = new Date();
  var today = new Date();
  date.setMonth(date.getMonth()+1, 0);
  var daytimes = [];
  var datetimes = [];
  var numbers = [];
  var indexoftime = []; 

  for(const item of records) {
    const daytime = item['日付'];
    const datetime = item['日時'];
    const number = item['人数'];
    daytimes.push(String(daytime).substring(daytime.indexOf("/")+1));
    datetimes.push((Number(String(datetime).substring(0,datetime.indexOf(':')))-18)*2+Number(String(datetime).substring(datetime.indexOf(':')+1))/30);
    numbers.push(number);
  }

  for(i=0; i <= (date.getDate()-today.getDate()); i++){
      daytimes.forEach((daytime, index) => {
        if(Number(daytime) === today.getDate() + i){
          indexoftime.push([i,datetimes[index],numbers[index]]);
          indexoftime.push([i,datetimes[index]+1,numbers[index]]);
          indexoftime.push([i,datetimes[index]+2,numbers[index]]);
          indexoftime.push([i,datetimes[index]+3,numbers[index]]);
        }
      })
    }

  return indexoftime;
}

function getFormHTML(e, indexoftime, alert='') {
  var date = new Date();
  var today = new Date();
  date.setMonth(date.getMonth()+1, 0);

  let html = `
    <div class="main">
      <div class="container">
        <table border="1">
          <tbody>
            <tr>
              <th>
              </th>`;

    for(i=0; i <= (date.getDate()-today.getDate()); i++){
      html += `
                <th>
                  ${today.getMonth()+1}/${today.getDate() + i}
                </th>`;
    }
    html +=  `</tr>`;
    for(j=0; j <= 8; j++) {
      if(j % 2 == 0){
        var time = 18+Math.floor(j/2)+`:00`
      }else{
        var time = 18+Math.floor(j/2)+`:30`
      }
      html += `
              <tr>
                <td>
                  ${time}
                </td>`
                for(i=0; i <= (date.getDate()-today.getDate()); i++){
                  if(arrayIncludes2D(indexoftime,[i,j,2]) && arrayIncludes2D(indexoftime,[i,j,5]) && arrayIncludes2D(indexoftime,[i,j,6])){
                    html += `
                      <td>✖️
                      </td>`;
                  }else if(!arrayIncludes2D(indexoftime,[i,j,2]) && !arrayIncludes2D(indexoftime,[i,j,5]) && !arrayIncludes2D(indexoftime,[i,j,6])){
                    html += `
                      <td>◎
                      </td>`;
                  }else{
                    html += `
                      <td>△
                      </td>`;
                  }
                }
     html +=  `</tr>`;
    }
    html += `</tbody>
        </table>
      </div>
    </div>
  `;

  return html;
}

function arraysEqual(arr1, arr2, min, max) {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length -1 ; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  if (min <= arr1[arr1.length-1] && arr1[arr1.length-1] <= max)
  return true;
}

function arrayIncludes2D(array2D, targetArray) {
  var count = 0;
  if(targetArray[targetArray.length-1] <=2 ){
    var min = 0;
    var max = 2;
    var maxcount = 2;
  }else if(targetArray[targetArray.length-1] <=5){
    var min = 3
    var max = 5;
    var maxcount = 3;
  }else{
    var min = 6;
    var max = 10;
    var maxcount = 1;
  }
  for (let i = 0; i < array2D.length; i++) {
    if (arraysEqual(array2D[i], targetArray, min, max)) {
      count += 1;
    }
  }
  if (count > maxcount -1){
    return true;
  }
  return false;
}

function reply(replyToken, message) {
  var url = "https://api.line.me/v2/bot/message/reply";
  UrlFetchApp.fetch(url, {
    "headers": {
      "Content-Type": "application/json; charset=UTF-8",
      "Authorization": "Bearer " + channel_token,
    },
    "method": "post",
    "payload": JSON.stringify({
      "replyToken": replyToken,
      "messages": [{
        "type": "text",
        "text": message,
      }],
    }),
  });
  return ContentService.createTextOutput(JSON.stringify({"content": "post ok"})).setMimeType(ContentService.MimeType.JSON);
}

function replybuttons(replyToken,message) {
  var url = "https://api.line.me/v2/bot/message/reply";
  UrlFetchApp.fetch(url, {
    "headers": {
      "Content-Type": "application/json; charset=UTF-8",
      "Authorization": "Bearer " + channel_token,
    },
    "method": "post",
    "payload": JSON.stringify({
      "replyToken": replyToken,
      "messages": [{
          "type": "template",
          "altText": message + "\nで間違いないでしょうか？ よろしければ「はい」をやり直す場合は「いいえ」をお願いいたします！",
          "template": {
        "type": "confirm",
        "text": message + "\nで間違いないでしょうか？ よろしければ「はい」をやり直す場合は「いいえ」をお願いいたします！",
        "actions": [
          {
            "type": "message",
            "label": "はい",
            "text": "はい"
          },
          {
            "type": "message",
            "label": "いいえ",
            "text": "いいえ"
      }
    ]
  }
}],
    }),
  });
  return ContentService.createTextOutput(JSON.stringify({"content": "post ok"})).setMimeType(ContentService.MimeType.JSON);
}


function replylink(replyToken, messageText, linkUrl, linkLabel) {
  var url = "https://api.line.me/v2/bot/message/reply";
  UrlFetchApp.fetch(url, {
    "headers": {
      "Content-Type": "application/json; charset=UTF-8",
      "Authorization": "Bearer " + channel_token
    },
    "method": "post",
    "payload": JSON.stringify({
      "replyToken": replyToken,
      "messages": [{
        "type": "template",
        "altText": "リンクを送信しました。",
        "template": {
          "type": "buttons",
          "text": messageText,
          "actions": [{
            "type": "uri",
            "label": linkLabel,
            "uri": linkUrl
          }]
        }
      }]
    }),
  });

  return ContentService.createTextOutput(JSON.stringify({"content": "post ok"}))
    .setMimeType(ContentService.MimeType.JSON);
}