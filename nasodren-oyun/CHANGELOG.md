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

## Revizyon Paketi 5: Bugfix ve Optimizasyon

### Duraklat/Devam Et Butonu — Gerçek Kök Neden

- Buton aslında her zaman tıklanabiliyordu ve katman sırası zaten doğruydu
  (`_buildPauseMenu()` butonu her açılışta `view`'in en üstüne yeniden
  ekliyordu). Gerçek hata daha inceydi: `Input`, fare için **mutlak
  konumlandırma** kullanıyor — imleç nereye giderse raketin hedefi de oraya
  gidiyor, tıklama olsun olmasın. Duraklat ikonuna veya menüdeki
  "DEVAM ET"/"BÖLÜMÜ YENİDEN BAŞLAT"/"MENÜYE ÇIK" butonlarına fareyle
  yaklaşmak, oyun donuk göründüğü için fark edilmeden raketin kontrol
  hedefini o butonun ekran konumuna kaydırıyordu; oyun devam ettiği anda bu,
  raketin butona doğru "sıçraması" gibi görünüyordu — kullanıcının "buton
  düzgün çalışmıyor" izlenimi buradan geliyordu.
- Çözüm iki parçalı: `Input`'a bir `suspended` bayrağı eklendi
  (`src/core/input.js`) — `down()`/`move()` bu bayrak açıkken hiçbir şey
  yapmıyor. `GameScene._setPaused()` bu bayrağı `this.paused` ile senkron
  tutuyor, ve devam ederken (`on === false`) `input.setPointerTarget(this
  .paddle.x)` çağrısıyla kontrol hedefini **raketin o anki gerçek
  konumuna** yeniden hizalıyor — imleç/parmak duraklama sırasında nerede
  kalmış olursa olsun sıçrama tamamen ortadan kalkıyor. `GameScene.exit()`
  bu bayrağı her ihtimalde `false`'a döndürüyor (menüye/yeniden başlatmaya
  giden butonlar `_setPaused(false)`'u hiç çağırmadan sahne değiştirdiği
  için), böylece bir sonraki sahnede takılı kalmıyor.
- Ayrıca hem duraklat ikonu hem de paylaşılan `Button` bileşeni (tüm
  menülerdeki her buton) `pointertap` yerine anlık `pointerdown`
  dinliyor ve olayın hem Pixi hem de native tarayıcı yayılımını
  (`stopPropagation`) durduruyor — bu, aynı basışın `Input`'un pencere
  seviyesindeki dinleyicisine de ulaşıp oyun alanı girdisi gibi
  işlenmesini (yukarıdaki sıçrama probleminin bir başka kaynağı) baştan
  engelliyor. Değişiklik `ui.js#Button`, `game-scene.js`'teki duraklat
  ikonu ve `level-select-scene.js`'teki bölüm karolarını kapsıyor.

### Sinüs Doluluk Oranı — Hesap Hatası

- `_buildSinusMeter()`, seviyenin `_sinusTotal`'ını yalnızca sahneye
  girişte **bir kez** yakalıyordu. Ancak 30 saniyelik tuğla-doğma mekaniği
  (`BrickField.spawnBricks()`) `remaining`'i bu dondurulmuş toplamın
  üzerine çıkarabiliyor; bu durumda oran (`remaining / _sinusTotal`) 1.0'ı
  aşıyor ve tuğlalar ne kadar kırılırsa kırılsın sayaç bir daha asla en
  temiz aşamaya (sinus4) ulaşamıyordu — oyuncu gerçekten ilerleme
  kaydetse bile gösterge hep en tıkalı aşamada (sinus1) takılı kalıyordu.
- Düzeltme: `_updateSinusMeter(dt)` artık her karede `remaining`,
  `_sinusTotal`'ı aşarsa toplamı da yukarı çekiyor
  (`if (remaining > _sinusTotal) _sinusTotal = remaining`). Böylece bir
  doğma dalgası, oran matematiğini bozmak yerine "yeniden tıkanma" olarak
  doğru şekilde okunuyor ve yüzde eşikleri (%75/%50/%25) her zaman geçerli
  bir tabana göre hesaplanıyor. Playwright ile hem gerçek bir temizleme
  senaryosunda (sinus4'e ulaşma) hem de ardından gelen bir doğma dalgasında
  (sinus1'e geri sıçrama, yeni toplamın doğru şekilde büyümesi) doğrulandı.

### Mobil Uyumluluk

- `viewport.js`'in ölçekleme/letterbox matematiği ve `input.js`'in
  dokunmatik "çapa + delta" sürükleme deseni incelendi; ikisi de zaten
  doğruydu (gerçek bir telefon en-boy oranında ekran taraması yapılarak
  `viewport.scale`/`root.x` değerlerinin doğru ortaladığı doğrulandı).
  Gerçek eksiklik, yukarıdaki duraklatma/buton hatasıyla aynı kökten
  geliyordu: menü ve oyun-içi butonlar dokunmatik bir basışı da genel oyun
  girdisi olarak sızdırıyordu. `pointerdown` + `stopPropagation`
  değişikliği bunu da kapsadığı için artık hiçbir buton dokunuşu raketi
  veya fırlatma kuyruğunu etkilemiyor. `hasTouch`/`isMobile` ile taklit
  edilen bir telefon ekranında gerçek `touchscreen.tap()` ile menü
  butonuna dokunma ve gerçek `pointermove` delta'sıyla rakete parmak
  sürükleme, ikisi de doğrulandı.

### Top Boyutu

- `BALL.radius`, 5'ten **7**'ye çıkarıldı (`config.js`) — bu sefer sadece
  kozmetik `CYCLAMEN.visualScale` değil, çarpışma kutusunun kendisi
  büyüdü. Topun görsel boyutu zaten `radius`'tan türetildiği için
  (`Ball._bodyScale`, `ball.js`) sprite otomatik olarak orantılı büyüdü;
  ayrıca değişiklik gerektirmedi. Güvenlik payı: tuğla hücre yüksekliği
  (`GRID.cellH = 20`) yeni top çapının (14px) her zaman rahatça üzerinde,
  ve raketin en dar hâli (`PADDLE.widths.tiny = 34`) hâlâ çok daha geniş.
  `npm run check:nose` (tüm 13 seviyenin sinüs geometrisi top yarıçapına
  göre yeniden doğrulanıyor) ve 13 seviyenin tamamının hatasız yüklendiği
  bir smoke-test sonrasında hiçbir çarpışma/sekme davranışının bozulmadığı
  doğrulandı.

## Revizyon Paketi 6: Minimalist Tasarım Odağı

### 16:9 Geniş Ekran (Landscape)

- Masaüstü/geniş-ekran kutusu (`config.js`'teki `DESIGN`), 640x480 (4:3)
  yerine `Math.round(480 * 16 / 9)` = **853x480** (16:9) oldu. Portre
  (telefon) kutusu 480x854 olarak dokunulmadan kaldı.
- Bunu güvenli kılan şey, projenin zaten var olan "authored frame"
  mimarisi: çizilen sanat eseri ve `anatomy.js`'teki tüm sinüs izleri hâlâ
  sabit 640x480'lik `DESIGN_FRAME`'de yaşıyor; `frameX`/`frameY` bu çerçeveyi
  `FRAME_CX`/`FRAME_CY` merkezine göre YERLEŞTİRİYOR — portre kutuda zaten
  yapılan şeyin aynısı, sadece şimdi daha geniş bir kutuda ortalanıyor. Hiçbir
  iz koordinatı, hiçbir tuğla hücresi değişmedi.
- Ayrıca mutlu bir tesadüf: `background.png` 1920x1080 (16:9), 640x480'lik
  çerçeveye cover-fit edilirken zaten 853.3 tasarım pikseli genişliğinde
  render ediliyordu (yükseklik ekseni baskın olduğu için) — eski 640
  genişlikli kutu bu SATIRINI zaten oluşturulmuş resmin 106.65px'ini her
  iki yandan kırpıyordu. Yeni 16:9 kutu tam da bu kırpmayı sıfıra indirecek
  genişlikte: arka plan artık native en-boy oranında, sıfır kırpmayla,
  ekstra kod gerekmeden uçtan uca görünüyor.
- `FIELD`, `GRID`, `Hud` (bar genişliği, can/duraklat konumları),
  `resolveDesignHeight` gibi her şey zaten `DESIGN.width`'i doğrudan
  okuyordu (sabit 640 değil), bu yüzden değişiklik tek satırlık oldu.
  `npm run check:nose` hem yatay hem dikey kutuda tekrar doğrulandı,
  tüm 13 seviye hatasız yüklendi.

### Sol Üst Sinüs Göstergesinin Kaldırılması

- Köşedeki dört-aşamalı `sinus1..4.png` doluluk göstergesi
  (`GameScene._buildSinusMeter`/`_updateSinusMeter`) koddan tamamen
  silindi: sprite'lar, `TEX.sinus1-4` baked yedekleri,
  `assets.js`'teki dört manifest girişi, hepsi kaldırıldı.

### Arka Planda Kırmızı/Mavi Doluluk Geçişi

- Doluluk bilgisi artık doğrudan arka planın kendisinde: `background.png`
  (mavi, "sağlıklı") en altta sabit kalıyor, üzerine kullanıcının eklediği
  `bg-red.png` (kırmızı, "iltihaplı") aynı cover-fit/konumlandırma ile
  ikinci bir Sprite olarak biniyor — ikisi de aynı paylaşılan
  `_placeBackgroundLayer()` metodundan geçtiği için piksel piksel
  çakışıyorlar.
- `GameScene._updateBgCrossfade(dt)`, her karede kırmızı katmanın
  alfasını `remaining / totalBreakable` oranına yumuşakça (lerp)
  yaklaştırıyor: bölüm başında 1.0 (tam kırmızı), tuğlalar kırıldıkça
  düşüyor, bölüm temizlenince 0.0 (tam mavi). 30 saniyelik tuğla-doğma
  mekaniği `remaining`'i orijinal toplamın üzerine çıkarırsa
  (`bricks.js#spawnBricks`), payda da onunla birlikte büyüyor — Paket
  5'teki aynı düzeltme burada da uygulandı.
- Boss seviyesinde kırılabilir tuğla olmadığından (`_bgTotal <= 0`),
  kırmızı katman hep alfa 1'de kalıyor — kronik/hep-iltihaplı okuma,
  `_updateBackdrop`'un kendi (halihazırda devre dışı) yorumuyla da tutarlı.
- Playwright ile doğrulandı: 1.0 → 0.75 → 0.5 → 0.25 → 0 oranlarının her
  biri beklenen alfaya yakınsıyor, ve alfa düşükken mavi katman kırmızının
  altından tam hizalı şekilde görünüyor.

### Power-Up Temizliği ve Raket Sabitlemesi

- Power-up tablosundan (`powerups.js`) üç güç tamamen kaldırıldı: Geniş
  Raket (`big`), Dar Raket (`small`) ve Bölüm Atlama (`warp`) —
  ikonları (`powerup-icons.js`) ve artık kullanılmayan `arrow()` yardımcı
  fonksiyonu dahil.
- `warp`'ın tek çağrı yeri olan `GameScene.warpLevel()` silindi;
  `_completeLevel(warped)` parametresiz `_completeLevel()`'e indirgendi
  (ölü "BÖLÜM ATLANDI" dalı ile birlikte).
- **Rebound Effect (Dekonjestan) de kaldırıldı**, açıkça istenmemiş olsa
  da: bu deneme-aşaması kapsülü ("TESTING BUILD", `TRIAL.levelIndex=0` ile
  hâlâ Seviye 1'de aktifti) yalnızca raketi genişletip sonra normalden
  dar bir hâle çökertmekten ibaretti — yani "raketin boyutu asla
  değişmemeli" kuralını ihlal eden tek kalan mekanizmaydı. `REBOUND`
  config bloğu, `REBOUND_CAPSULE`, `reboundEffect()`/`_reboundCrash()` ve
  `_dropExtras` (yalnızca bu kapsülü role katmak için vardı) tamamen
  silindi. `TRIAL.levelIndex` kaldı — Sneeze (HAPŞU!) refleksini
  kısıtlamaya devam ediyor, bu paketten etkilenmedi.
- `paddle.js`: `widthState`/`targetW`/`setWidthState()` ve `update()`
  içindeki genişlik-yumuşatma (easing) bloğu tamamen silindi. Raket artık
  `PADDLE.width` (sabit 88px, `config.js`) ile inşa ediliyor ve bu değer
  bir daha hiç değişmiyor. `PADDLE.widths` (`tiny`/`small`/`normal`/`big`)
  haritası tek bir `PADDLE.width` sayısına indirgendi.
- Doğrulama: kalan yedi power-up'ın tamamı arka arkaya uygulanıp raket
  30 kare boyunca güncellendi — `paddle.w` hiç kıpırdamadı (88 → 88).

## Revizyon Paketi 7: Hikaye Anlatımı ve UI Düzeltmeleri

### Yüksek Skorlar Taşıma Hatası — Gerçek Kök Neden

- Skor satırları (`menu-scene.js#_showScores`) sıra/isim/skor/bölüm
  sütunlarını hep MUTLAK tahta koordinatlarıyla (150/184/452/492)
  konumlandırıyordu — bunlar, panelin eskiden 640 genişlikli yatay kutuda
  `x=130`'da oturduğu döneme göre ayarlanmıştı. Paket 6'da `DESIGN.width`
  16:9 için 853'e çıkınca panel `x≈236.5`'e kaydı, ama satırlar hâlâ eski
  mutlak konumlarında kaldı — bu da tüm listeyi panelin SOLUNA taşırıyordu.
  Kullanıcının bildirdiği "metinler taşıyor" hatasının gerçek nedeni buydu.
- Düzeltme: her sütun artık panelin kendi `x`'inden (`boxX`) bir ofset
  olarak hesaplanıyor, mutlak bir sayı değil — böylece pano hangi
  `DESIGN.width`'te olursa olsun (yatay/dikey, 640/853/480) satırlar
  panelin içinde kalıyor.
- Ayrıca, tek değişken uzunluklu alan olan oyuncu adına bir güvenlik ağı
  olarak `wordWrap`/`wordWrapWidth` eklendi (skor sütununa taşmasını
  kesin olarak engeller) — isim zaten girişte 8 karakterle
  sınırlandırılmış olsa da (`results-scene.js#NAME_MAX`).
- Doğrulama: Playwright ile panelin gerçek `x` sınırları hesaplanıp her
  metnin sol/sağ kenarının bu sınırların içinde kaldığı doğrulandı
  (taşan metin listesi boş döndü).

### TransitionScene Asset Güncellemesi

- İlk merkez görsel artık `ASSET.png` değil `loading1.png` (virüs) —
  `assets.js`'teki manifest girişi ve `textures.js`'teki
  yükle/yedek-doku mantığı güncellendi. Tutarlılık için diğer iki anahtar
  da yeniden adlandırıldı: `loadingHeart` → `loading2`, `loadingFlame` →
  `loading3` (ikincisi zaten bir alev değil, siklamen çiçeğiydi — eski isim
  yanıltıcıydı).

### Bağlamsal İpucu (TIP) Sistemi

- `TransitionScene`, merkez görseli artık `enter()` içinde BİR KEZ seçip
  (`this._centerKey`), hem sprite'ı hem ipucunu bu tek seçimden besliyor —
  eskiden ikisi birbirinden bağımsız rastgele seçiliyordu.
- Üç yeni/ayrı ipucu havuzu eklendi, `TIPS_BY_KEY` ile merkez görsele
  eşleniyor:
  - `loading1` (virüs) → `TIPS_VIRUS`: sinüzit, iltihap ve virüs
    enfeksiyonlarıyla ilgili 3 ipucu.
  - `loading2` (kalp) → `TIPS_HEART`: sinüzitin genel vücut sağlığı,
    yorgunluk ve bağışıklığa etkisiyle ilgili 3 ipucu.
  - `loading3` (siklamen) → mevcut `TIPS` dizisi (5 ipucu, zaten siklamen
    temalı) — revive-scene.js bu diziyi hâlâ aynı şekilde kullanıyor,
    çünkü ReviveScene'in merkez görseli her zaman siklamen.
- Doğrulama: Playwright ile 40 ardışık ziyaret örneklendi; her görsel
  anahtarı yalnızca kendi havuzundaki ipuçlarıyla eşleşti, hiçbir çapraz
  eşleşme görülmedi. Gerçek `loading1.png`/`loading2.png`/`loading3.png`
  dokularının (sahte/boş doku değil) doğru yüklendiği ayrıca ekran
  görüntüsüyle teyit edildi.

## Revizyon Paketi 8: 16:9'dan 16:10'a — Daha Az Boş Alan

- Masaüstü/geniş-ekran kutusu (`config.js`'teki `DESIGN`), Paket 6'nın
  853x480 (16:9) değerinden **768x480 (16:10)**'a çekildi
  (`Math.round(480 * 16 / 10)`). Seçim gerekçesi: `background.png`'nin
  cover-fit genişliği (`_placeBackgroundLayer`, game-scene.js) zaten
  853.3 tasarım pikseli — bu, DESIGN_FRAME'e (640x480, sabit) göre
  hesaplanıyor ve DESIGN.width'ten bağımsız. 853'lük kutu bu genişliği
  hiç kırpmıyordu (tuğla ızgarasının her iki yanında 106.65px boş resim
  bırakıyordu); 768'lik kutu aynı resmin kenarlarından simetrik olarak
  42.65px'ini kırpıyor, ızgara kenar boşluğunu 72px'e indiriyor — "fazla
  geniş ve boş" hissi buradan gidiyor.
- Bu, Paket 6'da kurulan aynı mekanizma sayesinde TEK SATIRLIK bir
  değişiklik: `DESIGN_FRAME`, `FRAME_SCALE`, `frameX`/`frameY` hiçbiri
  değişmedi — yalnızca `FRAME_CX` (= `DESIGN.width / 2`) yeni merkeze
  kaydı ve her şey (arka plan, tuğla ızgarası, sinüs izleri) onunla
  birlikte yeniden ortalandı.
- **UI kontrolü:** Paket 7'de tüm panel/metin konumları zaten `DESIGN.width`
  ve panelin kendi `x`'inden bağıl olarak hesaplandığı için (bkz. Paket 7,
  Yüksek Skorlar düzeltmesi), bu genişlik değişikliği hiçbir ek kod
  gerektirmedi — HUD, menü kartları, Yüksek Skorlar paneli ve Bölüm Seç
  ızgarası otomatik olarak yeni 768px genişliğe ortalandı.
- **Kırmızı/mavi geçiş kontrolü:** `background.png` ve `bg-red.png` hâlâ
  aynı paylaşılan `_placeBackgroundLayer()` metodundan, aynı
  `DESIGN_FRAME`/`FRAME_CX`/`FRAME_CY` ile geçtiği için ikisi de kutu
  genişliğinden bağımsız olarak birlikte kaydı — aralarında yeni bir kayma
  oluşmadı. (İki dosyanın kendi çözünürlükleri arasında zaten var olan,
  Paket 6'dan beri değişmemiş, göz ile fark edilmeyen ~0.4px'lik bir
  cover-fit farkı var — bg-red.png 1672x941, background.png 1920x1080
  olarak dışa aktarılmış, ama ikisi de aynı 16:9 orana sahip olduğu için
  bu fark ekranda hiç görünmüyor.)
- Doğrulama: `npm run check:nose` iki kutuda da (yatay+dikey) geçti;
  Playwright ile 13 seviye + Bölüm Seç + Sonuç ekranı + Yüksek Skorlar
  paneli hatasız yüklendi; kırmızı/mavi geçiş oranları (1.0/0.5/0.0)
  beklendiği gibi doğrulandı; ekran görüntüleriyle ızgara kenar boşluğunun
  daraldığı ve hiçbir metnin panellerden taşmadığı teyit edildi.

## Revizyon Paketi 9: Standart Oranları Bırakıp Yüze Özel Kırpma

### Yüzün Kendi Sınırlarına Göre Özel Genişlik

- Masaüstü kutusu artık 16:9 veya 16:10 gibi adı olan bir orana değil,
  doğrudan `background.png`'deki YÜZE kırpılıyor: **545x480**
  (`LANDSCAPE_WIDTH`, `config.js`). Dikey (telefon) kutu — 480x854 —
  dokunulmadı.
- Ölçüm gözle değil, dosyadan yapıldı: `background.png` 1920x1080'lik,
  yumuşak vinyetli bir fotoğraf — sert bir silüet kenarı yok, bu yüzden
  "yüzün sınırı" şöyle tanımlandı: sinüs çizimlerinin hiç ulaşmadığı tek
  yatay şerit olan y 480-560 ("kum saati" şeklin belindeki dar geçit)
  boyunca örneklenen bir parlaklık profilinin, arka plan tabanından yüzün
  kendi orta-ton platosuna doğru %20'lik eşiği geçtiği piksel sütunu. Bu,
  kaynak x≈347'de (sol) ve kompozisyonun 960 orta hattına göre simetrisiyle
  x≈1573'te (sağ) gerçekleşiyor.
- Bu ölçüm, `_placeBackgroundLayer`'ın (game-scene.js) kullandığı AYNI
  cover-fit oranından (480/1080=0.4444) tahta pikseline çevrildi: yarım
  yüz genişliği (613 kaynak piksel) × 0.4444 = 272.4 tahta pikseli, çerçeve
  merkezinin her iki yanında — toplam 544.8, 545'e yuvarlandı.
- **Tuğla ızgarası için güvenli miydi?** Evet — tüm 13 seviyenin
  `levels.js`'teki satırları statik olarak taranarak hiçbir seviyenin 3.
  ile 9. sütunlar dışında bir hücre kullanmadığı doğrulandı (bu aralık,
  dosyanın kendi başındaki ayrıntılı pozisyon haritasıyla da örtüşüyor).
  152-488 çerçeve pikseli (336px) genişliğindeki bu kullanılan aralık,
  545px'lik yeni tahtanın duvarlarının 100px İÇİNDE kalıyor — ızgara
  boyutuna (sütun sayısı, hücre genişliği) HİÇ dokunulmadı, sadece tahta
  onun etrafında daraldı.
- **Arka plan hizalaması:** `background.png` ve `bg-red.png` hâlâ aynı
  paylaşılan `_placeBackgroundLayer()`'dan, aynı `DESIGN_FRAME`/`FRAME_CX`/
  `FRAME_CY` ile geçtiği için otomatik olarak birlikte kaydı ve x ekseninde
  ortalandı — yeni bir kod satırı gerekmedi.
- **UI senkronizasyonu:** Yüksek Skorlar paneli, HUD ve menü kartları
  zaten `DESIGN.width`'e bağıl olduğundan otomatik ortalandı. Ancak Bölüm
  Seç ekranında GERÇEK bir regresyon bulundu ve düzeltildi: dar kutuda
  (545px) sütun sayısı otomatik olarak 5'ten 3'e düştü (eski 132px'lik
  karo genişliğiyle), bu da 13 seviye için 5 satır gerektirdi ve son satır
  "MENÜYE DÖN" butonuyla üst üste bindi. `level-select-scene.js`'teki karo
  boyutu 132x74'ten 112x63'e küçültüldü (aynı en-boy oranı korunarak),
  bu da 545px'te 4 sütun / 4 satıra, 480px'lik dikey kutuda hâlâ 3 sütuna
  karşılık geliyor — her iki kutuda da butonla çakışmadan rahatça sığıyor.
- Doğrulama: `npm run check:nose` iki kutuda da geçti; tüm 13 seviye
  gerçek oynanışla test edilip her birinin kullandığı tuğla sütunlarının
  3-9 aralığında kaldığı programatik olarak doğrulandı; Bölüm Seç
  ekranının düzeltmeden önceki (karolar butonun altına giriyor) ve sonraki
  (temiz 4 satır, boşluklu) hâlleri ekran görüntüsüyle karşılaştırıldı;
  dikey (telefon) kutunun bu değişiklikten etkilenmediği ayrıca doğrulandı.
