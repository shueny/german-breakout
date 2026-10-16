"""新增 A1 單字到 public/vocab.json；以去掉冠詞的字根去重，已存在的字會略過並列出。執行：python3 scripts/add_vocab.py"""
import json, re, sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / 'public' / 'vocab.json'

PLURAL = {'die Nudeln', 'die Kopfschmerzen', 'die Handschuhe', 'die Öffnungszeiten', 'die Nebenkosten', 'die Ferien', 'die Sommerferien'}

NEW = {
'問候、禮貌與基本對話': """
Guten Morgen|早安
Guten Tag|日安 / 你好
Guten Abend|晚上好
Gute Nacht|晚安(睡前)
bis später|待會見
bis morgen|明天見
Wie geht's?|你好嗎？
gleichfalls|你也是 / 彼此彼此
Prost!|乾杯！
Guten Appetit|祝好胃口
Viel Glück|祝你好運
Viel Spaß|玩得開心
Alles Gute|一切順利
schade|可惜
genau|沒錯 / 正是
natürlich|當然
okay|好的
stimmt|對 / 沒錯
Moment mal|等一下
Wie bitte?|請再說一次？
kein Problem|沒問題
die Begrüßung|問候 / 迎接
der Abschied|告別
grüßen|打招呼
sich bedanken|道謝
Mahlzeit!|用餐愉快(午間問候)
""",
'人物、家庭與個人資料': """
die Person|人 / 人物
der Nachbar|鄰居(男)
die Nachbarin|鄰居(女)
der Onkel|叔叔 / 舅舅
die Tante|阿姨 / 姑姑
der Cousin|堂表兄弟
die Cousine|堂表姊妹
der Enkel|孫子
die Enkelin|孫女
der Neffe|姪子 / 外甥
die Nichte|姪女 / 外甥女
der Schwager|姊夫 / 妹夫 / 大伯
die Schwägerin|嫂嫂 / 弟媳 / 小姑
der Single|單身者
die Nationalität|國籍
der Deutsche|德國人(男)
die Deutsche|德國人(女)
Deutschland|德國
deutsch|德國的 / 德語
Österreich|奧地利
die Schweiz|瑞士
Taiwan|台灣
das Geschlecht|性別
der Mitbewohner|室友(男)
die Mitbewohnerin|室友(女)
geschieden|離婚的
getrennt|分居的 / 分開的
der Nachname|姓氏
""",
'身體、健康與日常作息': """
der Rücken|背部
der Hals|脖子 / 喉嚨
das Ohr|耳朵
die Nase|鼻子
der Zahn|牙齒
das Herz|心臟
der Finger|手指
das Knie|膝蓋
der Zahnarzt|牙醫
das Krankenhaus|醫院
die Apotheke|藥局
das Medikament|藥物
die Tablette|藥片
der Schmerz|疼痛
die Kopfschmerzen|頭痛
die Erkältung|感冒
der Husten|咳嗽
der Schnupfen|流鼻水 / 鼻塞
gesund|健康的
die Gesundheit|健康
sich fühlen|感覺(身心狀態)
die Grippe|流感
der Notarzt|急診醫生
der Notruf|緊急電話
die Krankenkasse|健保 / 醫療保險
die Versicherung|保險
sich ausruhen|休息
der Schlaf|睡眠
wach|醒著的
Zähne putzen|刷牙
sich kämmen|梳頭
die Brille|眼鏡
schwanger|懷孕的
dick|胖的 / 厚的
dünn|瘦的 / 薄的
die Diät|節食 / 飲食療法
satt|吃飽的
traurig|悲傷的
froh|高興的
nervös|緊張的
die Angst|害怕 / 恐懼
""",
'食物、飲料與餐廳': """
das Mittagessen|午餐
das Abendessen|晚餐
der Käse|起司
die Wurst|香腸
das Würstchen|小香腸
die Suppe|湯
die Nudeln|麵條
die Pizza|披薩
der Zucker|糖
der Pfeffer|胡椒
die Marmelade|果醬
der Honig|蜂蜜
das Müsli|麥片
der Joghurt|優格
die Sahne|鮮奶油
das Eis|冰淇淋 / 冰
die Schokolade|巧克力
der Keks|餅乾
die Orange|柳橙
die Zitrone|檸檬
die Erdbeere|草莓
die Traube|葡萄
die Zwiebel|洋蔥
die Karotte|紅蘿蔔
die Gurke|小黃瓜
der Pilz|蘑菇
das Mineralwasser|礦泉水
die Cola|可樂
die Limonade|檸檬汽水
der Sekt|氣泡酒
der Kellner|服務生(男)
die Kellnerin|服務生(女)
das Trinkgeld|小費
die Tasse|杯子(有把手)
der Teller|盤子
das Messer|刀子
die Gabel|叉子
der Löffel|湯匙
die Serviette|餐巾
lecker|好吃的
süß|甜的 / 可愛的
sauer|酸的
scharf|辣的
salzig|鹹的
vegetarisch|素食的
die Bar|酒吧
die Kneipe|小酒館
das Picknick|野餐
backen|烘焙
braten|煎 / 烤
schneiden|切
probieren|試吃 / 試試看
reservieren|預約(餐廳)
die Reservierung|預約(名詞)
die Portion|一份
""",
'購物、金錢與衣物': """
der Supermarkt|超市
das Kaufhaus|百貨公司
das Einkaufszentrum|購物中心
der Markt|市場
die Drogerie|藥妝店
die Buchhandlung|書店
das Sonderangebot|特價
der Rabatt|折扣
die Quittung|收據
das Bargeld|現金
der Geldautomat|提款機
die EC-Karte|金融卡
das Kleingeld|零錢
der Schein|鈔票
die Münze|硬幣
kostenlos|免費的
umsonst|免費 / 白費
die Hose|褲子
das Hemd|襯衫
das T-Shirt|T 恤
der Pullover|毛衣
das Kleid|洋裝
der Rock|裙子
der Mantel|大衣
die Mütze|毛帽
der Hut|帽子
die Socke|襪子
der Stiefel|靴子
der Schal|圍巾
die Handschuhe|手套
der Gürtel|皮帶
die Armbanduhr|手錶
der Regenschirm|雨傘
anprobieren|試穿
passen|合身 / 合適
die Umkleidekabine|試衣間
umtauschen|換貨
die Garantie|保固
der Katalog|型錄
liefern|送貨
die Lieferung|送貨(名詞)
die Tüte|袋子
der Einkaufswagen|購物車
die Öffnungszeiten|營業時間
modern|現代的 / 時尚的
die Mode|時尚
""",
'住家、家具與生活': """
der Stuhl|椅子
der Sessel|扶手椅
das Regal|架子 / 書架
die Lampe|燈
der Teppich|地毯
das Fenster|窗戶
die Tür|門
die Wand|牆壁
der Boden|地板 / 地面
das Dach|屋頂
der Keller|地下室
die Garage|車庫
das Wohnzimmer|客廳
das Schlafzimmer|臥室
das Kinderzimmer|兒童房
das Arbeitszimmer|書房
der Flur|走廊 / 玄關
die Heizung|暖氣
der Strom|電
das Gas|瓦斯
die Waschmaschine|洗衣機
der Fernseher|電視機
das Radio|收音機
die Spülmaschine|洗碗機
die Mikrowelle|微波爐
der Staubsauger|吸塵器
der Müll|垃圾
die Mülltonne|垃圾桶
aufräumen|整理 / 收拾
putzen|打掃 / 擦
spülen|洗碗 / 沖洗
bügeln|燙衣服
das Handtuch|毛巾
die Seife|肥皂
das Kissen|枕頭 / 抱枕
die Decke|被子 / 天花板
der Spiegel|鏡子
der Hausmeister|管理員
die Nebenkosten|雜費 / 水電費
die Kaution|押金
der Mietvertrag|租約
die Wohngemeinschaft (WG)|合租公寓
die Klingel|門鈴
klingeln|按門鈴 / 響
der Briefkasten|信箱
der Hof|院子 / 中庭
""",
'交通與旅行': """
die U-Bahn|地鐵
die Linie|路線
die Richtung|方向
die Station|車站 / 站
der Fahrplan|時刻表
die Verspätung|誤點
umsteigen|轉乘
der Flug|航班
der Pilot|飛行員
die Grenze|邊境
das Visum|簽證
der Rucksack|背包
die Unterkunft|住宿
die Jugendherberge|青年旅館
die Pension|民宿 / 退休金
der Campingplatz|露營區
das Zelt|帳篷
die Tankstelle|加油站
das Benzin|汽油
tanken|加油
parken|停車
der Parkplatz|停車場 / 車位
das Parkhaus|停車塔
der Führerschein|駕照
die Ampel|紅綠燈
die Kreuzung|十字路口
die Brücke|橋
der Stau|塞車
der Unfall|意外事故
das Motorrad|機車
das Schiff|船
der Hafen|港口
die Fähre|渡輪
abbiegen|轉彎
die Rückfahrkarte|來回票
hin und zurück|來回
die Ermäßigung|優惠 / 折扣票
das Ziel|目的地 / 目標
der Tourist|觀光客
buchen|預訂
die Buchung|預訂(名詞)
packen|打包
die Rundfahrt|觀光行程 / 環遊
die Landkarte|地圖
der Stadtplan|市區地圖
""",
'城市、地點與方向': """
die Kirche|教堂
das Rathaus|市政廳
das Museum|博物館
der Park|公園
der Zoo|動物園
die Bibliothek|圖書館
der Marktplatz|市集廣場
das Zentrum|市中心
die Innenstadt|市中心 / 市區
der Stadtteil|城區
die Umgebung|周邊 / 附近地區
der Weg|路 / 路線
nah|近的
in der Nähe|在附近
gegenüber|對面
neben|旁邊
hinter|在...後面
vorne|前面
um die Ecke|轉角處
entlang|沿著
überall|到處
irgendwo|某處
nirgends|無處 / 哪裡都沒有
das Gebäude|建築物
der Turm|塔
das Schloss|城堡 / 鎖
öffentlich|公共的
der Spielplatz|遊樂場
das Stadion|體育場
das Theater|劇院
die Oper|歌劇院
die Feuerwehr|消防隊
""",
'工作、辦公與電腦': """
das Büro|辦公室
die Besprechung|會議 / 討論
die Sitzung|會議
der Mitarbeiter|員工(男)
die Mitarbeiterin|員工(女)
das Gehalt|薪水
der Lohn|工資
der Vertrag|合約
die Bewerbung|求職申請
sich bewerben|應徵
der Lebenslauf|履歷
die Stellenanzeige|徵才廣告
die Ausbildung|職業培訓
die Fabrik|工廠
der Ingenieur|工程師
der Mechaniker|技工
der Koch|廚師(男)
die Köchin|廚師(女)
der Bäcker|麵包師
der Friseur|理髮師(男)
die Friseurin|理髮師(女)
der Polizist|警察(男)
die Polizistin|警察(女)
der Taxifahrer|計程車司機
der Hausarzt|家庭醫生
die Krankenschwester|護士
der Krankenpfleger|護理師(男)
der Kaufmann|商人
die Sekretärin|秘書
der Programmierer|程式設計師
das Passwort|密碼
die Datei|檔案
speichern|儲存
löschen|刪除
herunterladen|下載
die Tastatur|鍵盤
die Maus|滑鼠 / 老鼠
der Bildschirm|螢幕
der Laptop|筆電
die Webseite|網頁
online|線上
die App|應用程式
die Nachricht|訊息 / 消息
die Überstunde|加班(一小時)
die Teilzeit|兼職
die Vollzeit|全職
die Kündigung|解雇 / 辭職
kündigen|辭職 / 解約
""",
'學校、學習與語言': """
die Universität|大學
die Vorlesung|大學講課
das Seminar|研討課
der Professor|教授
die Note|成績 / 音符
das Zeugnis|成績單
die Grammatik|文法
die Vokabel|單字
das Wörterbuch|字典
übersetzen|翻譯
die Übersetzung|翻譯(名詞)
die Übung|練習(名詞)
üben|練習
die Bedeutung|意思 / 意義
der Deutschkurs|德語課
Englisch|英語
Chinesisch|中文
die Fremdsprache|外語
die Muttersprache|母語
das Heft|筆記本
die Tafel|黑板
der Stift|筆
das Blatt|紙張 / 葉子
die Schultasche|書包
die Mappe|資料夾
das Lineal|尺
der Radiergummi|橡皮擦
die Schere|剪刀
bestehen|通過(考試)
durchfallen|不及格
das Diplom|文憑
das Gymnasium|文理中學
die Grundschule|小學
die Ferien|假期(學校)
die Sommerferien|暑假
der Stundenplan|課表
das Fach|科目
die Mathematik|數學
die Geschichte|歷史 / 故事
die Biologie|生物
die Kunst|藝術
aufpassen|注意 / 專心
zuhören|傾聽
nachsprechen|跟讀
markieren|標記
ergänzen|補充 / 填入
zuordnen|配對
sortieren|排序
notieren|記下
das Rätsel|謎題
""",
'休閒、運動與娛樂': """
die Musik|音樂
das Konzert|音樂會
die Band|樂團
singen|唱歌
die Gitarre|吉他
das Klavier|鋼琴
das Instrument|樂器
das Fernsehen|電視(節目)
die Serie|影集
der Roman|小說
die Zeitschrift|雜誌
das Spiel|遊戲 / 比賽
der Ball|球
das Tennis|網球
der Basketball|籃球
der Volleyball|排球
das Tischtennis|桌球
joggen|慢跑
das Fitnessstudio|健身房
das Training|訓練
die Mannschaft|隊伍
das Tor|進球 / 大門
der Sieg|勝利
verlieren|輸 / 遺失
spazieren gehen|散步
der Spaziergang|散步(名詞)
angeln|釣魚
fotografieren|拍照
malen|畫畫
zeichnen|素描 / 畫
basteln|手作
der Spaß|樂趣
die Langeweile|無聊
langweilig|無聊的
interessant|有趣的
spannend|刺激的 / 精彩的
die Ausstellung|展覽
das Festival|音樂節 / 慶典
die Eintrittskarte|門票
der Club|俱樂部 / 夜店
das Feuerwerk|煙火
Weihnachten|聖誕節
Ostern|復活節
Silvester|跨年夜
das Neujahr|新年
schenken|送禮
""",
'天氣、自然與動物': """
die Katze|貓
der Vogel|鳥
das Pferd|馬
die Kuh|牛
das Schwein|豬
das Tier|動物
der Wald|森林
der Berg|山
der Fluss|河
die Insel|島
der Strand|海灘
die Wolke|雲
der Schnee|雪
schneien|下雪
das Gewitter|雷雨
der Nebel|霧
das Klima|氣候
die Temperatur|溫度
warm|溫暖的
kalt|冷的
heiß|熱的
kühl|涼的
trocken|乾的
nass|濕的
sonnig|晴朗的
windig|有風的
bewölkt|多雲的
der Himmel|天空
der Mond|月亮
der Stern|星星
die Erde|地球 / 土地
die Natur|大自然
die Luft|空氣
das Feld|田野
die Pflanze|植物
das Gras|草
die Umwelt|環境
""",
'電話、郵件與聯絡': """
die SMS|簡訊
die Mailbox|語音信箱
das Paket|包裹
der Umschlag|信封
die Postkarte|明信片
der Briefträger|郵差
zurückrufen|回電
die Handynummer|手機號碼
die E-Mail-Adresse|電子郵件地址
das Netz|網路 / 訊號
der Kontakt|聯絡 / 聯絡人
erreichen|聯絡上 / 到達
die Verbindung|連線 / 連結
auflegen|掛電話
abheben|接電話 / 提款
die Leitung|線路
faxen|傳真(動詞)
das Telefonbuch|電話簿
die Telefonnummer|電話號碼
""",
'基本動詞與日常動作': """
aufmachen|打開
zumachen|關上
tragen|攜帶 / 穿著
ziehen|拉 / 搬
schieben|推
werfen|丟
fallen|掉落 / 跌倒
rennen|跑
springen|跳
steigen|上升 / 爬
fangen|接住 / 抓
lassen|讓 / 留下
passieren|發生
versuchen|嘗試
schaffen|做到 / 完成
zeigen|展示 / 指出
vergessen|忘記
sich erinnern|記得
denken|想 / 認為
meinen|認為 / 意思是
hoffen|希望
wünschen|希望 / 祝
sich setzen|坐下
aufwachen|醒來
wechseln|更換 / 兌換
zurückkommen|回來
weggehen|離開
entscheiden|決定
sich interessieren|對...有興趣
vorbereiten|準備
planen|計畫
organisieren|安排 / 籌辦
sich beeilen|趕快
drehen|轉動
füllen|裝滿
gießen|澆水 / 倒
bauen|建造
stören|打擾
ändern|改變
aufschreiben|寫下
ausgeben|花費(錢)
sparen|存錢 / 節省
leihen|借
behalten|保留
wegwerfen|丟掉
""",
'時間、頻率與順序': """
manchmal|有時候
selten|很少
täglich|每天的
wöchentlich|每週的
monatlich|每月的
jährlich|每年的
zuerst|首先
danach|之後
zuletzt|最後
endlich|終於
plötzlich|突然
vorher|之前
nachher|之後
übermorgen|後天
vorgestern|前天
heute Abend|今晚
das Mal|次 / 回
zweimal|兩次
damals|當時
neulich|最近
inzwischen|在此期間
die Dauer|持續時間
die Mitternacht|午夜
der Alltag|日常生活
regelmäßig|定期的
gleichzeitig|同時
rechtzeitig|及時
Viertel vor|差一刻
Viertel nach|過一刻
seit wann|從什麼時候
bis wann|到什麼時候
wie lange|多久
wie oft|多常
wie spät|幾點了
ab und zu|偶爾
""",
'描述與形容詞': """
schmutzig|髒的
sauber|乾淨的
voll|滿的
leer|空的
offen|開著的 / 開放的
nett|友善的 / 親切的
freundlich|友善的
unfreundlich|不友善的
höflich|有禮貌的
hübsch|漂亮的
hässlich|醜的
stark|強壯的 / 強的
schwach|弱的
dunkel|暗的
bunt|彩色的
rund|圓的
eckig|方的
weich|軟的
hart|硬的
tief|深的
flach|平的
schmal|窄的
eng|緊的 / 狹窄的
bequem|舒適的
gefährlich|危險的
sicher|安全的 / 當然
gemütlich|溫馨舒適的
ähnlich|相似的
anders|不同的
genug|足夠的
fast|幾乎
ganz|完全 / 整個
ziemlich|相當
besonders|特別
toll|很棒的
super|超棒的
prima|很好的
egal|無所謂
komisch|奇怪的 / 好笑的
fleißig|勤奮的
faul|懶惰的
klug|聰明的
dumm|笨的
reich|富有的
arm|窮的
berühmt|有名的
praktisch|實用的
schlimm|糟糕的
perfekt|完美的
typisch|典型的
privat|私人的
echt|真的
wahr|真實的
""",
'文法小詞（代名詞、介係詞、連接詞）': """
du|你
uns|我們(受格/與格)
euch|你們(受格/與格)
mich / mir|我(受格 / 與格)
ihnen / Ihnen|他們(與格) / 您(與格)
niemand|沒有人
jemand|某人
etwas|某物 / 一些
manche|有些
einige|幾個 / 一些
außer|除了
trotzdem|儘管如此
deshalb|因此
weil|因為
dass|（引導子句）...這件事
wenn|如果 / 當
ob|是否
obwohl|雖然
entweder ... oder|要不...就是
sondern|而是
doch|可是 / 對呀(反駁)
mal|一下(語氣詞)
nämlich|也就是 / 因為
eigentlich|其實
überhaupt|根本 / 究竟
wirklich|真的
bestimmt|一定
wahrscheinlich|可能
hoffentlich|希望
außerdem|此外
zum Beispiel|例如
ungefähr|大約
etwa|大約
mindestens|至少
höchstens|最多
insgesamt|總共
pro|每
wegen|由於
während|在...期間
noch nicht|還沒
nicht mehr|不再
schon mal|曾經
gar nicht|根本不
weder ... noch|既不...也不
""",
}

def base(de: str) -> str:
    s = re.sub(r'\(.*?\)', '', de).strip().lower()
    s = re.sub(r'^(der|die|das)\s+', '', s)
    return s

def gender(de: str) -> str:
    if de in PLURAL: return 'pl'
    if de.startswith('der '): return 'm'
    if de.startswith('die '): return 'f'
    if de.startswith('das '): return 'n'
    return 'other'

def main() -> int:
    vocab = json.loads(VOCAB.read_text(encoding='utf-8'))
    existing = {base(v['de']) for v in vocab}
    categories = {v['category'] for v in vocab}
    added, skipped = [], []
    seen_new = set()
    for cat, blob in NEW.items():
        if cat not in categories:
            print('未知分類:', cat); return 1
        for line in blob.strip().splitlines():
            de, zh = (p.strip() for p in line.split('|', 1))
            b = base(de)
            if b in existing or b in seen_new:
                skipped.append(de); continue
            seen_new.add(b)
            added.append({'de': de, 'zh': zh, 'gender': gender(de), 'category': cat})
    vocab.extend(added)
    order = list(dict.fromkeys(v['category'] for v in vocab))
    vocab.sort(key=lambda v: order.index(v['category']))
    lines = ',\n'.join('  ' + json.dumps(v, ensure_ascii=False) for v in vocab)
    VOCAB.write_text('[\n' + lines + '\n]\n', encoding='utf-8')
    print(f'新增 {len(added)} 個，略過已存在 {len(skipped)} 個:', ', '.join(skipped))
    print('總數', len(vocab))
    for cat, n in Counter(v['category'] for v in vocab).items():
        print(f'{n:4d}  {cat}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
