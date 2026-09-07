# Changelog

Bu dosya, "Brickstorm" (Nasodren) projesinin görsel reskin, yeni oynanış
mekanikleri ve UI/UX revizyonları sürecinde yapılan tüm geliştirmeleri
kronolojik olarak belgeler. Kod tabanındaki mevcut davranışın en güncel hali
her zaman kaynak koddur; bu dosya neyin, neden ve hangi sırayla yapıldığının
kaydıdır.

## Yeni Eklenen Asset'ler

Tüm görseller `public/assets/` altında, `src/core/assets.js`'teki `preload`
bundle'ına kayıtlı ve `src/game/textures.js#applyImageAssets()` tarafından
ilgili `TEX` anahtarlarına bağlanıyor. Her biri, gerçek PNG yüklenene kadar
prosedürel bir yedek (fallback) doku ile devreye giriyor — yükleme
başarısız olsa bile oyun asla boş bir dokuyla karşılaşmıyor.

- **`background.png`** — Oyunun tüm sahnelerinde arka plan (sinüs/yüz
  illüstrasyonu).
- **`cyclamen-ball.png`** — Topun sprite görseli (eski prosedürel "cyclamen
  çiçeği" çiziminin yerini aldı).
- **`ASSET.png`, `loading2.png`, `loading3.png`** — TransitionScene'in
  merkez görselleri (virüs maskotu, kalp, alev/kanat şekli).
- **`brick1.png` / `brick2.png` / `brick3.png`** — Tuğla HP-tier görselleri.
- **`siklement.png`** — ReviveScene'in devasa merkez görseli (siklamen
  çiçeği illüstrasyonu).

## Yeni Oynanış Mekanikleri

### Kemik (Bone) Tuğla

- Eski "Metal" (`'M'`) tuğla türü tamamen kaldırıldı; tek kırılmaz tuğla
  türü olarak **Bone** (`'B'`) kaldı.
- Bone dokusu (`boneFace()` — `textures.js`) fildişi gövde + gözenek dokusu
  + camgöbeği (`0x35d0d8`) renkli, hücre sınırının içine gömülü (inset)
  çoklu halka + parlak sınır çizgisiyle görsel olarak çok daha belirgin
  hale getirildi.
- Tüm seviye dizilimlerindeki eski `'M'` karakterleri `'B'`'ye çevrildi
  (Vault, Fortress, Bunker, Gauntlet, Brickstorm).

### Tuğla HP-Tier Sistemi

- Klasik palet-renkli rastgele tuğla görselleri yerine, tam hücreli
  (`shape: 'full'`) standart tuğlalar artık **güncel `hits` değerine göre**
  görsel değiştiriyor: 1 can → `brick1.png`, 2 can → `brick2.png`, 3+ can →
  `brick3.png` (`textureKeyFor()` — `textures.js`).
- Bu, eski çatlak-overlay (`crack1`/`crack2`) + gri tint hasar sistemini
  tamamen ortadan kaldırdı — tier görseli tek başına oyuncuya kalan
  dayanıklılığı gösteriyor.
- Yarım/küçük şekilli hücreler (`<`, `>`, `o`) hâlâ eski palet-renkli
  dokuları kullanıyor (bu görseller o boyutlara uygun değil).

### 30 Saniye Kuralı — Tuğla Doğması

- `GameScene._updateLevelTimer()`, her `LEVEL_TIMER.spawnInterval` (30s)
  saniyede bir, ızgarada **daha önce bir tuğlanın bulunduğu ama o an boş
  olan** hücrelerden rastgele 2-3 tanesine yeni standart (1 hit) tuğla
  yerleştiriyor (`BrickField.spawnBricks()` — `bricks.js`).
- Adaylar yalnızca seviyenin orijinal diziliminde (`_originalSpecs`) bir
  tuğla barındırmış hücrelerden seçiliyor — bu, `cavity: true` seviyelerde
  (Level 1) sinüs geometrisi kısıtlamasını (`check-nose`) otomatik olarak
  koruyor.
- Rastgelelik `Math.random()` (paylaşılan oyun RNG'si) ile yapılıyor, çünkü
  `remaining` sayısını ve dolayısıyla seviyenin bitiş koşulunu etkiliyor —
  kozmetik `cosmeticRandom()` değil.

### 60 Saniye Kuralı — Güçlenme (Buff) ve Kalıcı Nabız

- Seviye başına bir kez, `LEVEL_TIMER.buffAt` (60s) saniyesinde, sahnedeki
  tüm kırılabilir tuğlaların `hits` ve `maxHits` değeri +1 artıyor
  (`BrickField.buffAllBricks()`).
- Görsel geri bildirim olarak her buflenen tuğla **kalıcı bir "nefes alma"
  (breathing) animasyonu** kazanıyor: alfa değeri `BUFF_PULSE.alphaMin`
  (0.72) ile 1.0 arasında sürekli salınıyor, sabit bir camgöbeği tonu
  (`BUFF_PULSE.tint`) karışıyor (`Brick.applyBuff()` / `tickPulse()`).
  Eski 0.4 saniyelik "flash sonra eski haline dön" sistemi tamamen
  kaldırıldı — artık seviye boyunca kalıcı.
- Bone (kırılmaz) tuğlalar bu mekanikten muaf.

## TransitionScene (Ara/Loading Sahnesi)

- Seviyeler arası ve oyuna başlarken gösterilen yeni bir ara sahne
  (`src/scenes/transition-scene.js`) eklendi; `TransitionScene`,
  `MenuScene`/`LevelSelectScene`/`GameScene`'in level-atlama, restart ve
  Revive akışlarına bağlandı.
- Merkezde salınan (sinüs dalgası) bir görsel + alt kısımda animasyonlu
  "Loading..." metni + sağ altta rastgele seçilmiş bir siklamen bilgisi
  ("TIP:") gösteriyor.
- **Rastgele tekil görsel:** Üç farklı görsel (virüs maskotu, kalp, alev)
  aynı ekranda birlikte değil, her ziyarette **birinin rastgele seçilerek**
  tek başına gösterilmesi şeklinde tasarlandı — ekranı boğmadan çeşitlilik
  sağlıyor.
- Minimum bekleme süresi 2.8 saniyeden **5 saniyeye** çıkarıldı.
- Tipografi: `heavyText()` yardımcı fonksiyonu ile kalın (`fontWeight:
  '900'`), beyaz dolgulu, siyah stroke ve drop-shadow'lu profesyonel metin
  stili eklendi (hem "Loading..." hem "TIP:" başlığı/gövdesi için).

## ReviveScene (Canlandırma Ekranı) — Baştan Tasarım

- Game Over ekranındaki "REVIVE" butonuna tıklandığında açılan bekleme
  ekranı (`src/scenes/revive-scene.js`) sıfırdan tasarlandı:
  - **Merkez odak:** `siklement.png` artık ekranın ortasında devasa (280px)
    boyutta.
  - **Bilgi metni:** Seçilen siklamen bilgisi görselin hemen altında,
    ortalanmış, sarmalanmış (`wordWrap`) ve aynı kalın/gölgeli tipografiyle
    gösteriliyor. Bir playthrough boyunca aynı bilgi iki kez gösterilmiyor
    (`run.usedTips` takibi).
  - **Sayaç konumu:** Eski devasa merkez sayaç kaldırıldı; 10 saniyelik geri
    sayım artık sağ üst köşede minimalist bir panel içinde.
  - **"GEÇ" butonu:** Süre dolduğunda otomatik olarak oyuna dönülmüyor —
    sayaç yerini menü butonlarıyla aynı stilde, tıklanabilir bir "GEÇ"
    butonuna bırakıyor (klavye ile Enter/Space desteği dahil). Oyuna dönüş
    ve canların yenilenmesi yalnızca bu butona tıklanınca gerçekleşiyor.

## Son Denge ve Temizlik Revizyonları

- **Revive dengesi:** Bir Revive artık canları tam doldurmuyor
  (`startingLives`/3 değil) — `RUN.reviveLives = 1` ile oyuncuya yalnızca
  **1 can** veriyor. Bu, bir devam hakkının "temkinli oynamaktan daha iyi"
  bir seçenek olmasını engelliyor.
- **Tuğla türü temizliği:** `bricks.js`'teki `CHAR_MAP`'ten Silver (`'S'`),
  Gold (`'G'`), Explosive (`'X'`) ve Invisible (`'I'`) türleri tamamen
  kaldırıldı. Artık sistemde yalnızca **HP-tier'li standart tuğlalar** ve
  **Bone** kalıyor. İlgili tüm kod yolları da temizlendi:
  - `Brick.hidden`/`reveal()` (invisible mekaniği) tamamen silindi.
  - `BrickField._destroyChain()`'deki patlayıcı zincir-tetikleme mantığı
    kaldırıldı, tek bir tuğla yok eden basit `_destroyBrick()` ile
    değiştirildi.
  - `GameScene._resolveBrickResult()`'taki patlayıcıya özel parçacık/ses
    dalı ve invisible-reveal dalı kaldırıldı.
  - Kullanılmayan `SCORE.tough`, `SCORE.explosive` ve `VFX.blast` config
    sabitleri silindi.
  - Mevcut seviye dizilimlerinde (Pillars, Vault, Ghosts, Checkerboard,
    Fortress, Downpour, Bunker, Nova, Gauntlet, Brickstorm) geçen tüm eski
    harfler, oyunun çökmemesi için görsel düzeni koruyacak şekilde standart
    rakam tuğlalarına (`1`-`8`) çevrildi.
- **Doğrulama:** `npm run build`, `npm run check:nose` ve tüm 13 seviyeyi
  (boss dahil) gerçek fizik ile test eden bir smoke-test sonrasında hiçbir
  seviyede `standard`/`bone` dışında bir tuğla türü kalmadığı, Level 1'in
  hatasız oynanabildiği ve Revive akışının doğru şekilde 1 can verdiği
  doğrulandı.
