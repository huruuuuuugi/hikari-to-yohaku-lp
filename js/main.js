// =========================================================
// 光と余白 LP / main.js
// やっていることは4つ：
//   ① スクロールしたらヘッダーに背景をつける
//   ② 要素が画面に入ったら、ふわっと表示する
//   ③ スクロール＝館内で過ごす時間。朝 → 夕方へ時間を進め、
//      壁の色・差し込む光を変える
//   ④ フロアマップ：いまいる部屋・通った部屋を平面図に表示する
//
// 軽く動かすためのルール
//   - 要素の位置は「読み込み時・画面サイズが変わった時」だけ測って覚えておく
//     (スクロールのたびに測ると、ブラウザが毎回レイアウトを計算し直して重くなる)
//   - いまいる部屋は IntersectionObserver に教えてもらう
//   - 画面への書き込みは「値が変わったときだけ」行う
//
// このファイルは body の最後で読み込むので、HTMLはすべて読み込み済みの状態で動く。
// 全体を (function () { ... })(); で包み、ここで作る変数がほかのスクリプトとぶつからないようにしている
// =========================================================
(function () {

  // ---------------------------------------------------------
  // 使う要素を最初にまとめて取得する
  // (後ろで宣言した変数を前の関数から使うと、呼ぶ順番しだいでエラーになるため)
  // ---------------------------------------------------------
  const header = document.querySelector('.js-header');
  const fv = document.querySelector('.fv');
  const greeting = document.getElementById('greeting');
  const information = document.getElementById('information');
  const sunlight = document.querySelector('.js-sunlight');
  const rooms = Array.prototype.slice.call(document.querySelectorAll('.js-room'));

  const guide = document.querySelector('.js-guide');
  const mapEl = document.getElementById('guide-map');
  const guideRoom = document.querySelector('.js-guide-room');
  const progressEl = document.querySelector('.js-guide-progress');
  const mapRooms = Array.prototype.slice.call(document.querySelectorAll('.floor__room'));
  const here = document.querySelector('.js-here');
  const openBtn = document.querySelector('.js-guide-open');
  const closeBtn = document.querySelector('.js-guide-close');
  const galleryStart = rooms.indexOf(document.getElementById('room01'));   // Room 01 が何番目のセクションか

  const isWide = window.matchMedia('(min-width: 1400px)');                    // マップを自動で開く広さか
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)'); // 動きを減らす設定か

  // ---------------------------------------------------------
  // 位置を測って覚えておく(読み込み時・画面サイズが変わった時だけ)
  // ---------------------------------------------------------
  const pos = { fvBottom: 0, start: 0, end: 1 };
  // 前回書き込んだ値を覚えておき、変わったときだけ書き込む
  const last = { p: -1, wall: '', sun: '', warm: '' };

  function measure() {
    const y = window.scrollY;
    const windowH = window.innerHeight;
    // getBoundingClientRect は「画面の上端からの位置」なので、スクロール量を足してページ上の位置にする
    if (fv) { pos.fvBottom = fv.getBoundingClientRect().bottom + y - header.offsetHeight; }
    if (greeting && information) {
      pos.start = greeting.getBoundingClientRect().top + y - windowH;           // ごあいさつが見え始めたら「朝」
      pos.end = information.getBoundingClientRect().top + y - windowH * 0.5;    // ご来館案内で「夕方」
    }
    last.p = -1;   // 位置が変わったので、次の描画では必ず書き直す
    requestDraw();
  }

  // ---------------------------------------------------------
  // ① ヘッダーの背景切り替え
  // FVを過ぎたら .is-scrolled を付ける → CSS側で背景色が変わる
  // ---------------------------------------------------------
  let headerScrolled = null;
  function updateHeader(scroll) {
    const scrolled = scroll > pos.fvBottom;
    if (scrolled === headerScrolled) return;   // 変わっていなければ何もしない
    headerScrolled = scrolled;
    header.classList.toggle('is-scrolled', scrolled);
  }

  // ---------------------------------------------------------
  // ② スクロールでフェードイン
  // IntersectionObserver：要素が画面に入った瞬間だけ通知してくれる仕組み。
  // スクロールのたびに全要素の位置を計算しなくてよいので軽い
  // ---------------------------------------------------------
  const fadeObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-show');
        fadeObserver.unobserve(entry.target); // 一度表示したら監視をやめる
      }
    });
  }, { rootMargin: '0px 0px -15% 0px' });

  document.querySelectorAll('.js-fade').forEach(function (el) { fadeObserver.observe(el); });

  // ---------------------------------------------------------
  // ③ 館内の時間
  // 「ごあいさつ」から「ご来館案内」までを、朝から夕方までの1日に見立てる。
  // 進み具合(0〜1)に応じて、下の表の値をなめらかにつなぐ
  // ---------------------------------------------------------
  const timeline = [
    //  進み   壁の色(RGB)        光の色(RGB)        光の角度
    { at: 0,    wall: [246, 244, 240], sun: [255, 252, 245], angle: -42 }, // 朝：白い光
    { at: 0.45, wall: [244, 235, 221], sun: [255, 238, 205], angle: -55 }, // 昼：やわらかな光
    { at: 0.7,  wall: [240, 225, 203], sun: [255, 218, 170], angle: -66 }, // 午後：琥珀色の光
    { at: 1,    wall: [226, 215, 201], sun: [240, 196, 160], angle: -74 }  // 夕暮れ
  ];

  // a と b のあいだを t(0〜1)の割合で混ぜる
  function mix(a, b, t) { return a + (b - a) * t; }

  // 進み具合 p に対応する値を、timeline の前後2点から求める
  function getTimeValues(p) {
    for (let i = 0; i < timeline.length - 1; i++) {
      const from = timeline[i];
      const to = timeline[i + 1];
      if (p <= to.at) {
        const t = (p - from.at) / (to.at - from.at);
        return {
          wall: from.wall.map(function (v, k) { return Math.round(mix(v, to.wall[k], t)); }),
          sun: from.sun.map(function (v, k) { return Math.round(mix(v, to.sun[k], t)); }),
          angle: mix(from.angle, to.angle, t)
        };
      }
    }
    return getTimeValues(1);
  }

  function updateTime(scroll) {
    if (!greeting || !information || !sunlight) return;
    const range = pos.end - pos.start;
    if (range <= 0) return;   // 位置がまだ測れていない(0で割らないように)
    const p = Math.min(Math.max((scroll - pos.start) / range, 0), 1);
    // ほとんど変わっていなければ何もしない。ただし両端(0と1)に着いたときは必ず書く
    const atEdge = (p === 0 || p === 1) && p !== last.p;
    if (!atEdge && Math.abs(p - last.p) < 0.002) return;
    last.p = p;

    const v = getTimeValues(p);

    // 壁の色：ページの背景(body)とヘッダーにだけ書き込む
    // (:root に書くとページ中の全要素が計算し直しになるため、使う場所に直接書く)
    const wall = 'rgb(' + v.wall.join(' ') + ')';
    if (wall !== last.wall) {
      last.wall = wall;
      document.body.style.backgroundColor = wall;
      header.style.setProperty('--wall', wall);
    }

    // 写真の色味：0.1刻みで切り替える(写真の filter が参照するので :root に書く。切り替えは10回だけ)
    const warm = (Math.round(p * 10) / 10).toFixed(1);
    if (warm !== last.warm) { last.warm = warm; document.documentElement.style.setProperty('--warm', warm); }

    // マップの「見学の進み具合」の線
    if (progressEl) { progressEl.style.transform = 'scaleX(' + p.toFixed(3) + ')'; }

    // 差し込む光：動きを減らす設定のときは表示していないので、計算もしない
    if (reduceMotion.matches) return;

    // 位置と傾きは transform だけで動かす(描き直しが起きず軽い)
    // CSS のグラデーションは -55deg で描いてあるので、その差だけ回転させる
    sunlight.style.transform = 'translate3d(' + mix(-10, 10, p).toFixed(2) + '%, 0, 0) rotate(' + (v.angle + 55).toFixed(2) + 'deg)';

    // 光の色：6段階に分けて切り替える(細かく変えても目に見えず、処理が増えるだけなので)
    const sunStep = getTimeValues(Math.round(p * 6) / 6).sun.join(' ');
    if (sunStep !== last.sun) { last.sun = sunStep; sunlight.style.setProperty('--sun-rgb', sunStep); }
  }

  // ---------------------------------------------------------
  // ④ フロアマップ
  // 各セクションの data-map と、平面図の部屋の data-map を対応させる
  // ---------------------------------------------------------
  const visited = {};      // 一度入った部屋を覚えておく
  let currentMap = null;

  // 平面図の色と、現在地のしるしを更新する
  function updateMap(key) {
    if (!key || key === currentMap) return;   // 部屋が変わったときだけ更新
    currentMap = key;
    visited[key] = true;

    mapRooms.forEach(function (el) {
      const k = el.getAttribute('data-map');
      el.classList.toggle('is-current', k === key);
      el.classList.toggle('is-visited', !!visited[k] && k !== key);
    });

    // 現在地のしるしを、その部屋の下端寄り(部屋名と重ならない位置)へ動かす
    const target = mapRooms.filter(function (el) { return el.getAttribute('data-map') === key; })[0];
    const rect = target && target.querySelector('rect');
    if (rect && here) {
      const box = rect.getBBox();
      here.style.transform = 'translate(' + (box.x + box.width / 2) + 'px, ' + (box.y + box.height - 6) + 'px)';
    }
  }

  // マップの開閉
  // 開いているとき：右上の × ボタンで閉じる
  // 閉じているとき：下のバーの「Map」ボタンで開く
  // moveFocus が true のときは、押したボタンの代わりに次に押すボタンへフォーカスを移す
  function setMapOpen(open, moveFocus) {
    guide.classList.toggle('is-open', open);
    mapEl.inert = !open;   // 閉じているあいだは、中のリンクにキーボードで移動できないようにする
    openBtn.setAttribute('aria-expanded', open);   // 開いているかどうかは「Map」ボタンで伝える
    if (moveFocus) { (open ? closeBtn : openBtn).focus(); }
  }

  // 広い画面(1400px以上)では、展示室(Room 01)に入ったらマップを自動で開く。
  // それより狭い画面(ノートPC・スマホ)では作品に重なるため自動では開かず、「Map」ボタンを押したときだけ開く。
  // 自動で開くのは最初の1回だけ。一度閉じた人には、再び勝手に開かない
  let autoOpened = false;
  function autoOpenMap() {
    if (autoOpened || !isWide.matches) return;
    autoOpened = true;
    setMapOpen(true, false);
  }

  // いまいる部屋が変わったときに呼ばれる
  let currentRoom = null;
  function setCurrentRoom(el) {
    if (el === currentRoom) return;
    currentRoom = el;
    guideRoom.textContent = el.getAttribute('data-room');

    // マップは展示室(Room 01)に入ってから表示する。
    // ご来館案内から先は「見学が終わった」のでマップをしまい、情報を読みやすくする
    const index = rooms.indexOf(el);
    const inGallery = galleryStart !== -1 && index >= galleryStart;
    const visitEnded = el.classList.contains('information') || el.classList.contains('cta');
    const showGuide = inGallery && !visitEnded;
    guide.classList.toggle('is-visible', showGuide);
    if (showGuide) { autoOpenMap(); }
    updateMap(el.getAttribute('data-map'));
  }

  // 画面の真ん中の線にかかっているセクションを「いまいる部屋」とする
  // rootMargin で上下を50%ずつ削ると、画面の真ん中の1本の線だけで判定できる。
  // 境目がちょうど真ん中に来ると2つ同時に「かかっている」状態になるので、
  // かかっているセクションを全部覚えておき、ページの下にあるほうを現在地にする
  const activeRooms = new Set();
  const roomObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { activeRooms.add(entry.target); }
      else { activeRooms.delete(entry.target); }
    });
    const current = rooms.filter(function (el) { return activeRooms.has(el); }).pop();
    if (current) { setCurrentRoom(current); }
  }, { rootMargin: '-50% 0px -50% 0px' });
  rooms.forEach(function (el) { roomObserver.observe(el); });

  if (guide && mapEl && openBtn && closeBtn) {
    openBtn.addEventListener('click', function () { setMapOpen(true, true); });
    closeBtn.addEventListener('click', function () { setMapOpen(false, true); });

    // 画面が狭くなったら(ウィンドウを縮めた・端末を回転した)、開いているマップを閉じる
    isWide.addEventListener('change', function (e) {
      if (!e.matches) { setMapOpen(false, false); }
    });

    // 狭い画面では、部屋を選んで移動したらマップを閉じる(作品が隠れないように)
    mapRooms.forEach(function (el) {
      el.addEventListener('click', function () {
        if (!isWide.matches) { setMapOpen(false, false); }
      });
    });
  }

  // ---------------------------------------------------------
  // スクロールのたびに実行。requestAnimationFrame で1フレーム1回にまとめる
  // ---------------------------------------------------------
  let ticking = false;
  function draw() {
    const scroll = window.scrollY;   // 読み取りはこれだけ。あとは覚えておいた位置と比べる
    updateHeader(scroll);
    updateTime(scroll);
    ticking = false;
  }
  function requestDraw() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(draw);
  }

  window.addEventListener('scroll', requestDraw, { passive: true });

  // 位置を測り直すタイミング：画面サイズの変更・画像やフォントの読み込み完了・ページの高さの変化
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts) { document.fonts.ready.then(measure); }
  if ('ResizeObserver' in window) { new ResizeObserver(measure).observe(document.querySelector('main')); }
  measure();

})();
