/* app.js — Vozimi CRM (v2). Framework-free. Premium black & white.
 * Desktop = sidebar app; mobile = bottom tabs. Dashboard computes client-side.
 * Voice understands transactions AND commands. Custom SVG icons only. */
(function () {
  'use strict';
  var _pending = 0;
  function _bar(on){var el=document.getElementById('loadbar');if(el)el.classList.toggle('on',!!on);}
  function api(a, p){
    _pending++; _bar(true);
    function done(){ if(--_pending<=0){_pending=0; _bar(false);} }
    return BK.api.call(a, p).then(function(r){done();return r;}, function(e){done();throw e;});
  }
  var I = BK.icon, CI = BK.catIcon;
  // Multi-currency: amounts format in the current project's currency.
  var CURRENCIES={INR:'₹',USD:'$',EUR:'€',GBP:'£',AED:'AED ',SAR:'SAR ',CAD:'C$',AUD:'A$',SGD:'S$',JPY:'¥',NPR:'NPR ',LKR:'LKR '};
  function curSym(){try{var c=(curProject()&&curProject().currency)||'INR';return CURRENCIES[c]||(BK.brand&&BK.brand.currency&&curSym())||'₹';}catch(e){return '₹';}}
  function money(v){v=Number(v)||0;var neg=v<0;return (neg?'-':'')+curSym()+Math.round(Math.abs(v)).toLocaleString('en-IN');}
  // ---- plan / freemium ----
  var FREE_LIMITS={aiDailyCap:5,micSeconds:30,invoiceEmail:false,reportExport:false,categoryManage:false,ledgerLimit:5,maxFilters:2};
  function plan(){return (S.user&&S.user.plan)||'free';}
  function isPro(){return plan()==='pro';}
  function isReadOnly(){return !!(S.user&&S.user.readOnly);}
  function lim(){return (S.user&&S.user.limits)||FREE_LIMITS;}
  function needPro(feature){openUpgrade(feature);}

  /* ---------- helpers ---------- */
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function h(html){var t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild;}
  function $(s,r){return (r||document).querySelector(s);}
  function $all(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  var toastT;
  function toast(msg,type){var el=$('#toast');if(!el)return;var ic=type==='err'?'close':type==='ok'?'check':'bell';
    el.innerHTML=I(ic)+'<span>'+esc(msg)+'</span>';el.className=(type||'')+' show';clearTimeout(toastT);
    toastT=setTimeout(function(){el.className=el.className.replace('show','').trim();},2800);}
  var ERR_MAP={NETWORK:'Could not reach the server. Please try again in a moment.',OFFLINE:'You are offline. Check your internet and try again.',UNAUTHORIZED:'Please sign in again.',BAD_CREDENTIALS:'Wrong email or password.',WEAK_PASSWORD:'Password must be at least 8 characters with a letter and a number.',EXISTS:'An account with this email already exists. Try signing in.',BAD_CODE:'That code is not correct. Please try again.',EXPIRED:'That code has expired. Request a new one.',LOCKED:'Too many attempts. Please wait a little and try again.',NO_OTP:'Please register again to get a new code.',OTP_REQUIRED:'Please verify your email to continue.',PENDING:'Your account is awaiting approval.',SUSPENDED:'Your account has been suspended.',RATE:'Too many requests. Please try again later.',AI_LIMIT:'Daily voice limit reached. Please try again tomorrow.',AI_DISABLED:'Voice is unavailable right now. Please type instead.',EMAIL_DISABLED:'Email is unavailable right now.',R2_DISABLED:'File storage is unavailable right now.',BAD_FILE:'That file type or size is not allowed.',NOT_FOUND:'Not found.',UPGRADE:'This is a Pro feature. Upgrade to continue.',PLAN_READONLY:'Your Pro plan has lapsed. Renew to make changes, you can still view everything.',PAY_OFF:'Payments are not set up yet. Please check back soon.',PAY_ERROR:'Could not process that. Please try again.'};
  function errMsg(e){
    var c=e&&e.code,m=(e&&e.message)||'';
    if(c==='UPGRADE'||c==='PLAN_READONLY')return m||ERR_MAP[c];
    if(c&&ERR_MAP[c])return ERR_MAP[c];
    // never surface internal/provider errors to users
    if(/error\s*\d{3}|resend|openai|sql|sqlite|d1\b|r2\b|fetch|undefined|null reference|stack|token|bearer|api key/i.test(m))return 'Something went wrong. Please try again.';
    return m||'Something went wrong. Please try again.';
  }
  function todayStr(){var d=new Date();return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());}
  function p2(n){return (n<10?'0':'')+n;}
  function fmtDate(d){try{return new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'});}catch(e){return d;}}
  function monthKey(d){return String(d).slice(0,7);}
  function monthLabel(ym){try{var p=ym.split('-');return new Date(p[0],p[1]-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'});}catch(e){return ym;}}
  function addMonths(ym,n){var p=ym.split('-');var d=new Date(Number(p[0]),Number(p[1])-1+n,1);return d.getFullYear()+'-'+p2(d.getMonth()+1);}
  function daysAgo(n){var d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);}
  function rangeFromDays(n){return {from:daysAgo(n),to:todayStr()};}

  /* ---------- state ---------- */
  var S={user:null,route:'dashboard',projects:[],projectId:null,lookups:null,features:{ai:true,email:false},
    tx:null,txProj:null,business:null};
  /* ============ File encryption (client-side, zero-knowledge) ============
   * Files are encrypted in the browser (AES-GCM) with a key derived from the
   * user's passphrase (PBKDF2). The server stores only ciphertext and never sees
   * the passphrase or key. Salt + a verifier are stored (non-secret) so we can
   * check the passphrase; the derived key lives only in this tab's memory. */
  var ENC={key:null,salt:'',verifier:'',enabled:false};
  function hex2buf(h){var a=new Uint8Array(h.length/2);for(var i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a;}
  function buf2hex(b){return Array.prototype.map.call(new Uint8Array(b),function(x){return('0'+x.toString(16)).slice(-2);}).join('');}
  function b64enc(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}
  function b64dec(s){var bin=atob(s),a=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
  function encDeriveKey(pass,saltHex){
    return crypto.subtle.importKey('raw',new TextEncoder().encode(pass),{name:'PBKDF2'},false,['deriveKey']).then(function(base){
      return crypto.subtle.deriveKey({name:'PBKDF2',salt:hex2buf(saltHex),iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    });
  }
  function encEncrypt(key,bytes){var iv=crypto.getRandomValues(new Uint8Array(12));return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,bytes).then(function(ct){var out=new Uint8Array(iv.length+ct.byteLength);out.set(iv,0);out.set(new Uint8Array(ct),iv.length);return out;});}
  function encDecrypt(key,bytes){var iv=bytes.slice(0,12),ct=bytes.slice(12);return crypto.subtle.decrypt({name:'AES-GCM',iv:iv},key,ct);}
  var ENC_VERIFY='Vozimi-ok';
  function encLoadMeta(){ // read salt/verifier/enabled from settings (via getSettings cache or fetch)
    return api('getSettings',{}).then(function(d){var s=d.settings||{};ENC.enabled=s.encEnabled==='true';ENC.salt=s.encSalt||'';ENC.verifier=s.encVerifier||'';return ENC;});
  }
  function encUnlocked(){return !!ENC.key;}
  function encSetup(pass){ // first time: make salt + verifier
    var saltHex=buf2hex(crypto.getRandomValues(new Uint8Array(16)));
    return encDeriveKey(pass,saltHex).then(function(key){return encEncrypt(key,new TextEncoder().encode(ENC_VERIFY)).then(function(v){
      var verHex=b64enc(v);
      return api('setSetting',{key:'encSalt',value:saltHex}).then(function(){return api('setSetting',{key:'encVerifier',value:verHex});}).then(function(){return api('setSetting',{key:'encEnabled',value:'true'});}).then(function(){
        ENC.key=key;ENC.salt=saltHex;ENC.verifier=verHex;ENC.enabled=true;try{sessionStorage.setItem('bk_enc',saltHex);}catch(e){}return true;});
    });});
  }
  function encUnlock(pass){
    if(!ENC.salt||!ENC.verifier)return Promise.reject(new Error('No encryption set up'));
    return encDeriveKey(pass,ENC.salt).then(function(key){return encDecrypt(key,b64dec(ENC.verifier)).then(function(dec){
      if(new TextDecoder().decode(dec)!==ENC_VERIFY)throw new Error('bad');ENC.key=key;return true;
    }).catch(function(){throw new Error('WRONG_PASSPHRASE');});});
  }
  // Ensure the key is unlocked; prompt for passphrase if needed. Returns a Promise(key) or rejects.
  function encEnsure(){
    if(encUnlocked())return Promise.resolve(ENC.key);
    return encLoadMeta().then(function(){
      if(!ENC.enabled)return null; // encryption off -> no key needed
      return new Promise(function(resolve,reject){
        openSheet('Unlock your files','<p class="muted" style="margin:0 0 12px;font-size:13.5px">Enter your encryption passphrase to open your encrypted files. We never store it.</p>'+
          '<div class="field"><div class="pass-wrap"><input id="unlP" type="password" placeholder="Encryption passphrase"/><button type="button" class="pass-eye" id="unlEye">'+I('eye')+'</button></div></div>'+
          '<button class="btn btn-primary btn-block" id="unlGo">Unlock</button>',function(root){
            bindEye('unlEye','unlP');
            $('#unlGo',root).onclick=function(){var p=$('#unlP',root).value;if(!p)return;var b=$('#unlGo',root);b.disabled=true;b.innerHTML='<span class="spin"></span>';
              encUnlock(p).then(function(){closeSheet();resolve(ENC.key);}).catch(function(){b.disabled=false;b.textContent='Unlock';toast('Wrong passphrase','err');});};
          });
        // if the sheet is dismissed without unlocking, reject on close is not tracked; caller handles null via timeout-free flow
      });
    });
  }
  function loadBusiness(force){
    if(!force&&S.business)return Promise.resolve(S.business);
    return api('getBusiness',{}).then(function(d){S.business=d.business||{};return S.business;}).catch(function(){S.business={};return S.business;});
  }
  function bizReady(b){b=b||S.business||{};return !!(b.name&&b.address&&(!b.gstEnabled||b.gstin));}
  var seq=0; // render sequence for click-fast guards
  function alive(mySeq){return mySeq===seq;}
  function getProjId(){try{return localStorage.getItem('bk_proj')||null;}catch(e){return null;}}
  function setProjId(id){S.projectId=id;try{localStorage.setItem('bk_proj',id);}catch(e){}}
  function curProject(){return S.projects.filter(function(p){return p.id===S.projectId;})[0]||{};}
  // theme
  function getTheme(){try{return localStorage.getItem('bk_theme')||'light';}catch(e){return 'light';}}
  function applyTheme(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('bk_theme',t);}catch(e){}var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'#0B0C0E':'#0B0B0C');refreshThemeBtns();}
  function toggleTheme(){applyTheme(getTheme()==='dark'?'light':'dark');}
  function refreshThemeBtns(){var dark=getTheme()==='dark';$all('[data-theme-btn]').forEach(function(b){b.innerHTML=I(dark?'sun':'moon')+'<span>'+(dark?'Light mode':'Dark mode')+'</span>';});var mb=$('#themeM');if(mb)mb.innerHTML=I(dark?'sun':'moon');}

  var CAT={BOOKING:{label:'Booking',lookup:'INVENTORY_TYPE'},VENDOR:{label:'Vendor',lookup:'VENDOR_TYPE'},
    SALARY:{label:'Salary',lookup:'SALARY_ROLE'},MISC:{label:'Miscellaneous',lookup:'MISC_TYPE'},
    LAND:{label:'Land cost',lookup:null},CHALLAN:{label:'Challan / Sanction',lookup:null}};
  var NAV=[['dashboard','Dashboard','dashboard'],['ledger','Transactions','ledger'],
    ['bookings','Bookings','home'],['vendors','Vendors','cube'],['invoices','Invoices','doc'],
    ['gst','GST invoices','folder'],['loans','Loans & Debts','wallet'],['reminders','Reminders','bell']];

  /* ======================= AUTH ======================= */
  var authState={email:'',category:'builder'};
  // Per-category customization: the data model and endpoints are identical; only these
  // labels (and the server-seeded vendor/expense lists) differ per business type.
  var PROFILES={
    builder:{label:'Contractor / Builder',icon:'building',noun:'Project',nounPlural:'Projects',cost:'Land cost',blurb:'Sites, materials, labour and bookings.',venEg:'Sharma Steel',custEg:'Mr. Patil',sayEg:'Paid 45 thousand to Sharma Steel today'},
    architect:{label:'Architect',icon:'compass',noun:'Project',nounPlural:'Projects',cost:'Land cost',blurb:'Fees, consultants and design projects.',venEg:'Structural Consultant',custEg:'Client name',sayEg:'Received 1 lakh design fee from client today'},
    farmer:{label:'Farmer',icon:'leaf',noun:'Farm',nounPlural:'Farms',cost:'Setup cost',blurb:'Seeds, inputs, labour and crop income.',venEg:'Agro Seeds',custEg:'Buyer name',sayEg:'Paid 8 thousand for seeds today'},
    smallbiz:{label:'Small business',icon:'store',noun:'Store',nounPlural:'Stores',cost:'Setup cost',blurb:'Suppliers, expenses and daily sales.',venEg:'ABC Wholesalers',custEg:'Customer name',sayEg:'Paid 20 thousand to ABC Wholesalers today'},
    influencer:{label:'Influencer / Creator',icon:'agent',noun:'Channel',nounPlural:'Channels',cost:'Setup cost',blurb:'Brand deals, gear, editors and payouts.',venEg:'Video Editor',custEg:'Brand name',sayEg:'Received 50 thousand brand deal today'}
  };
  function profile(){return PROFILES[(S.user&&S.user.category)||'builder']||PROFILES.builder;}
  function pw1(){return profile().noun;}
  function pwN(){return profile().nounPlural;}
  function cw(){return profile().cost;}
  function venEg(){return profile().venEg;}
  function custEg(){return profile().custEg;}
  /* ======================= i18n (en / hi / mr) ======================= */
  var LANGS={en:'English',hi:'हिंदी',mr:'मराठी'};
  var VOICE_LANG={en:'en-IN',hi:'hi-IN',mr:'mr-IN'};
  var I18N={
    hi:{
      'Dashboard':'डैशबोर्ड','Transactions':'लेन-देन','Bookings':'बुकिंग','Vendors':'वेंडर','Invoices':'चालान','GST invoices':'GST चालान','Reminders':'रिमाइंडर','Settings':'सेटिंग','Home':'होम','Txns':'लेन-देन','Add':'जोड़ें','More':'और','Notifications':'सूचनाएं','Help':'मदद','Help & Support':'मदद और सपोर्ट','Log out':'लॉग आउट',
      'Welcome back':'वापस स्वागत है','Sign in':'साइन इन','Sign up free':'मुफ्त साइन अप','Create your account':'अपना खाता बनाएं','Email':'ईमेल','Password':'पासवर्ड','Confirm password':'पासवर्ड की पुष्टि करें','Name':'नाम','WhatsApp number':'व्हाट्सऐप नंबर','What do you do?':'आप क्या काम करते हैं?','Verify your email':'अपना ईमेल सत्यापित करें','Verification code':'सत्यापन कोड','Verify':'सत्यापित करें','Resend code':'कोड फिर भेजें','Back to sign in':'साइन इन पर वापस','Create account':'खाता बनाएं','Almost there':'बस थोडा और',
      'Save':'सहेजें','Cancel':'रद्द करें','Confirm':'पुष्टि करें','Delete':'हटाएं','Create':'बनाएं','Edit':'संपादित करें','Save entry':'एंट्री सहेजें','New entry':'नई एंट्री','Confirm entry':'एंट्री की पुष्टि','New reminder':'नया रिमाइंडर','New invoice':'नया चालान','New booking':'नई बुकिंग','New vendor':'नया वेंडर','Download PDF':'PDF डाउनलोड','Send reply':'उत्तर भेजें','Reply':'उत्तर','Approve':'स्वीकार करें','Suspend':'निलंबित करें','Understand':'समझें','Manual form':'मैन्युअल फॉर्म',
      'Appearance':'दिखावट','Account':'खाता','Categories':'श्रेणियां','Language':'भाषा','Voice language':'आवाज की भाषा','Daily email report':'दैनिक ईमेल रिपोर्ट','Your tickets':'आपके टिकट','Support tickets':'सपोर्ट टिकट','Users':'यूज़र','Admin dashboard':'एडमिन डैशबोर्ड','Change password':'पासवर्ड बदलें','Save profile':'प्रोफाइल सहेजें','Update password':'पासवर्ड अपडेट करें','Light':'हल्का','Dark':'गहरा',
      'Type':'प्रकार','Category':'श्रेणी','Amount':'राशि','Date':'तारीख','Note':'नोट','Money out':'पैसा बाहर','Money in':'पैसा अंदर','Customer name':'ग्राहक का नाम','Vendor name':'वेंडर का नाम','Role':'भूमिका','Unit type':'यूनिट प्रकार','Subject':'विषय','Message':'संदेश',
      'Please confirm':'कृपया पुष्टि करें','You are all caught up':'आप पूरी तरह अप-टु-डेट हैं','No new notifications':'कोई नई सूचना नहीं','Saved':'सहेजा गया','Deleted':'हटा दिया','Created':'बन गया','Added':'जोड़ा गया','Removed':'हटा दिया','Profile saved':'प्रोफाइल सहेजी गई','Password updated':'पासवर्ड अपडेट हुआ','What happened?':'क्या हुआ?','Send to support':'सपोर्ट को भेजें'
    },
    mr:{
      'Dashboard':'डॅशबोर्ड','Transactions':'व्यवहार','Bookings':'बुकिंग','Vendors':'विक्रेते','Invoices':'पावत्या','GST invoices':'GST पावत्या','Reminders':'स्मरणपत्रे','Settings':'सेटिंग्ज','Home':'होम','Txns':'व्यवहार','Add':'जोडा','More':'अधिक','Notifications':'सूचना','Help':'मदत','Help & Support':'मदत आणि सपोर्ट','Log out':'लॉग आउट',
      'Welcome back':'पुन्हा स्वागत आहे','Sign in':'साइन इन','Sign up free':'फुकट साइन अप','Create your account':'तुमचे खाते तयार करा','Email':'ईमेल','Password':'पासवर्ड','Confirm password':'पासवर्डची पुष्टी करा','Name':'नाव','WhatsApp number':'व्हॉट्सअॅप नंबर','What do you do?':'तुम्ही काय काम करता?','Verify your email':'तुमचा ईमेल पडताळा','Verification code':'पडताळणी कोड','Verify':'पडताळा','Resend code':'कोड पुन्हा पाठवा','Back to sign in':'साइन इन कडे परत','Create account':'खाते तयार करा','Almost there':'अगदी जवळ',
      'Save':'जतन करा','Cancel':'रद्द करा','Confirm':'पुष्टी करा','Delete':'हटवा','Create':'तयार करा','Edit':'संपादित करा','Save entry':'एंट्री जतन करा','New entry':'नवीन एंट्री','Confirm entry':'एंट्रीची पुष्टी','New reminder':'नवीन स्मरणपत्र','New invoice':'नवीन पावती','New booking':'नवीन बुकिंग','New vendor':'नवीन विक्रेता','Download PDF':'PDF डाउनलोड','Send reply':'उत्तर पाठवा','Reply':'उत्तर','Approve':'मंजूर करा','Suspend':'निलंबित करा','Understand':'समजून घ्या','Manual form':'मॅन्युअल फॉर्म',
      'Appearance':'देखावा','Account':'खाते','Categories':'श्रेणी','Language':'भाषा','Voice language':'आवाजाची भाषा','Daily email report':'दैनंदिन ईमेल अहवाल','Your tickets':'तुमचे टिकिट','Support tickets':'सपोर्ट टिकिट','Users':'वापरकर्ते','Admin dashboard':'अॅडमिन डॅशबोर्ड','Change password':'पासवर्ड बदला','Save profile':'प्रोफाइल जतन करा','Update password':'पासवर्ड अपडेट करा','Light':'उजळ','Dark':'गडड',
      'Type':'प्रकार','Category':'श्रेणी','Amount':'रक्कम','Date':'तारीख','Note':'नोट','Money out':'पैसे बाहेर','Money in':'पैसे आत','Customer name':'ग्राहकाचे नाव','Vendor name':'विक्रेत्याचे नाव','Role':'भूमिका','Unit type':'युनिट प्रकार','Subject':'विषय','Message':'संदेश',
      'Please confirm':'कृपया पुष्टी करा','You are all caught up':'तुम्ही सर्व पाहिले आहे','No new notifications':'नवीन सूचना नाहीत','Saved':'जतन केले','Deleted':'हटवले','Created':'तयार झाले','Added':'जोडले','Removed':'काढले','Profile saved':'प्रोफाइल जतन केली','Password updated':'पासवर्ड अपडेट झाला','What happened?':'काय झाले?','Send to support':'सपोर्टला पाठवा'
    }
  };
  function uiLang(){try{return localStorage.getItem('bk_ui_lang')||'en';}catch(e){return 'en';}}
  function langChosen(){try{return !!localStorage.getItem('bk_ui_lang');}catch(e){return true;}}
  function tr(s){var l=uiLang();if(l==='en'||!s)return s;var d=I18N[l];return (d&&d[s])||s;}
  function setLang(l,reload){try{localStorage.setItem('bk_ui_lang',l);localStorage.setItem('bk_lang',VOICE_LANG[l]||'en-IN');}catch(e){}if(reload)location.reload();}
  function translateNode(node){var raw=node.nodeValue;if(!raw)return;var k=raw.trim();if(!k)return;var t=tr(k);if(t!==k)node.nodeValue=raw.replace(k,t);}
  function applyI18n(scope){
    if(uiLang()==='en')return;scope=scope||document.body;
    try{var w=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT,null),nodes=[],n;while(n=w.nextNode())nodes.push(n);nodes.forEach(translateNode);}catch(e){}
    try{scope.querySelectorAll&&scope.querySelectorAll('[placeholder]').forEach(function(el){var k=el.getAttribute('placeholder'),t=tr(k);if(t!==k)el.setAttribute('placeholder',t);});}catch(e){}
    try{scope.querySelectorAll&&scope.querySelectorAll('[aria-label]').forEach(function(el){var k=el.getAttribute('aria-label'),t=tr(k);if(t!==k)el.setAttribute('aria-label',t);});}catch(e){}
  }
  var _i18nObs;
  function startI18nObserver(){
    if(uiLang()==='en')return;
    document.documentElement.setAttribute('lang',uiLang());
    if(_i18nObs)_i18nObs.disconnect();
    _i18nObs=new MutationObserver(function(muts){muts.forEach(function(m){
      // Skip the live voice overlay so transcript updates are never touched/slowed.
      if(m.target&&m.target.closest&&m.target.closest('#voiceOverlay'))return;
      Array.prototype.forEach.call(m.addedNodes||[],function(nd){if(nd.nodeType===1){if(nd.closest&&nd.closest('#voiceOverlay'))return;applyI18n(nd);}else if(nd.nodeType===3)translateNode(nd);});});});
    try{_i18nObs.observe(document.body,{childList:true,subtree:true});}catch(e){}
    applyI18n(document.body);
  }
  function openLangModal(firstTime){
    var cur=uiLang();
    openSheet(firstTime?'Choose your language':'Language',
      (firstTime?'<p class="muted" style="margin:0 0 14px;font-size:13.5px">Pick the language you are comfortable with. The app and voice entry will use it. You can change it later in Account.</p>':'')+
      '<div class="cat-grid">'+Object.keys(LANGS).map(function(l){return '<button type="button" class="cat-opt'+(cur===l?' on':'')+'" data-lang="'+l+'"><span class="cat-tx"><b>'+LANGS[l]+'</b></span></button>';}).join('')+'</div>',
      function(root){
        $all('[data-lang]',root).forEach(function(b){b.onclick=function(){var l=b.getAttribute('data-lang');
          if(l===cur){closeSheet();if(firstTime)afterLang();return;}
          if(l==='en'){setLang('en',false);closeSheet();if(firstTime)afterLang();else location.reload();return;}
          setLang(l,true); // reload re-renders everything translated
        };});
      });
    function afterLang(){if(!S.projects.length)setTimeout(function(){openProjectSheet(true);},200);else setTimeout(showCoachmark,500);}
  }
  function pwError(pw){pw=String(pw||'');if(pw.length<8)return 'Password must be at least 8 characters.';if(!/[a-zA-Z]/.test(pw)||!/[0-9]/.test(pw))return 'Password needs at least one letter and one number.';return '';}
  function waValid(s){var d=String(s||'').replace(/\D/g,'');return d.length>=8&&d.length<=15;}
  function renderAuth(msg){authView('login',{msg:msg});}
  function authShell(inner){$('#app').classList.add('hide');var root=$('#auth-root');root.classList.remove('hide');root.innerHTML='';root.appendChild(h('<div class="auth"><div class="auth-card">'+inner+'</div></div>'));}
  function bindEye(btnId,inpId){var b=$('#'+btnId);if(!b)return;b.onclick=function(){var p=$('#'+inpId),sh=p.type==='password';p.type=sh?'text':'password';this.innerHTML=I(sh?'eyeOff':'eye');};}
  function authView(view,data){
    data=data||{};
    var brand='<div class="auth-brand"><img src="assets/icons/icon.svg" alt=""/> Vozimi</div>';
    var err=data.msg?'<div class="auth-err">'+esc(data.msg)+'</div>':'';
    var ok=data.ok?'<div class="auth-ok">'+esc(data.ok)+'</div>':'';
    if(view==='register'){
      var cats=['builder','architect','farmer','smallbiz','influencer'];
      authShell(brand+'<h1>Create your account</h1><p class="sub">Free to start. Verify your email and you are in, no approval needed.</p>'+err+
        '<form id="rf"><div class="field"><label>What do you do?</label><select id="rCat">'+
        cats.map(function(c){return '<option value="'+c+'"'+(authState.category===c?' selected':'')+'>'+esc(PROFILES[c].label)+'</option>';}).join('')+
        '</select><span class="field-hint" id="rCatHint">'+esc(PROFILES[authState.category].blurb)+' Your vendors, categories and dashboard are set up for this.</span></div>'+
        '<div class="field"><label>Name</label><input id="rName" autocomplete="name" placeholder="Your name"/></div>'+
        '<div class="field"><label>Email</label><input id="rEmail" type="email" autocomplete="email" required value="'+esc(authState.email)+'"/></div>'+
        '<div class="field"><label>WhatsApp number</label><input id="rWa" type="tel" autocomplete="tel" inputmode="tel" placeholder="+91 98765 43210"/><span class="field-hint">With country code. Used to send invoices and reports on WhatsApp.</span></div>'+
        '<div class="field"><label>Password</label><div class="pass-wrap"><input id="rPass" type="password" autocomplete="new-password" required placeholder="At least 8 characters"/><button type="button" class="pass-eye" id="rEye">'+I('eye')+'</button></div><span class="field-hint" id="rHint">Use at least 8 characters with a letter and a number.</span></div>'+
        '<div class="field"><label>Confirm password</label><div class="pass-wrap"><input id="rPass2" type="password" autocomplete="new-password" required placeholder="Re-enter password"/><button type="button" class="pass-eye" id="rEye2">'+I('eye')+'</button></div></div>'+
        '<button class="btn btn-primary btn-block" type="submit" id="rBtn">Create account '+I('chevronRight')+'</button></form>'+
        '<p class="auth-switch">Already have an account? <a href="#" id="toLogin">Sign in</a></p>'+
        '<p class="muted" style="font-size:12px;margin-top:8px">By continuing you agree to our <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy</a>.</p>');
      bindEye('rEye','rPass');bindEye('rEye2','rPass2');
      $('#rCat').onchange=function(){authState.category=this.value;var hint=$('#rCatHint');if(hint)hint.textContent=PROFILES[this.value].blurb+' Your vendors, categories and dashboard are set up for this.';};
      $('#toLogin').onclick=function(e){e.preventDefault();authView('login',{});};
      $('#rf').addEventListener('submit',function(e){e.preventDefault();
        var pw=$('#rPass').value,pw2=$('#rPass2').value,wa=$('#rWa').value.trim();
        var perr=pwError(pw);if(perr){authView('register',{msg:perr});return;}
        if(pw!==pw2){authView('register',{msg:'Passwords do not match. Please re-enter.'});return;}
        if(wa&&!waValid(wa)){authView('register',{msg:'Enter a valid WhatsApp number with country code.'});return;}
        var b=$('#rBtn');b.disabled=true;b.innerHTML='<span class="spin"></span>';authState.email=$('#rEmail').value.trim();
        api('register',{name:$('#rName').value.trim(),email:authState.email,whatsapp:wa,category:authState.category,password:pw}).then(function(){authView('otp',{ok:'Code sent. Check your inbox.'});}).catch(function(e2){
          if(e2&&e2.code==='EXISTS'){authView('login',{msg:'This email is already registered. Please sign in.'});return;}
          authView('register',{msg:errMsg(e2)});});});
    } else if(view==='otp'){
      authShell(brand+'<h1>Verify your email</h1><p class="sub">We sent a 6-digit code to <b>'+esc(authState.email)+'</b>.</p>'+err+ok+
        '<form id="of"><div class="field"><label>Verification code</label><input id="oCode" inputmode="numeric" maxlength="6" placeholder="000000" style="letter-spacing:8px;text-align:center;font-size:22px;font-weight:700"/></div>'+
        '<button class="btn btn-primary btn-block" type="submit" id="oBtn">Verify '+I('check')+'</button></form>'+
        '<p class="auth-switch"><a href="#" id="resend">Resend code</a> &middot; <a href="#" id="toLogin2">Back to sign in</a></p>');
      $('#of').addEventListener('submit',function(e){e.preventDefault();var b=$('#oBtn');b.disabled=true;b.innerHTML='<span class="spin"></span>';
        api('verifyOtp',{email:authState.email,code:$('#oCode').value.trim()}).then(function(){authView('login',{ok:'Email verified. Sign in to get started, you are on the Free plan.'});}).catch(function(e2){authView('otp',{msg:errMsg(e2)});});});
      $('#resend').onclick=function(e){e.preventDefault();api('resendOtp',{email:authState.email}).then(function(){authView('otp',{ok:'A new code is on its way.'});}).catch(function(e2){authView('otp',{msg:errMsg(e2)});});};
      $('#toLogin2').onclick=function(e){e.preventDefault();authView('login',{});};
      setTimeout(function(){var c=$('#oCode');c&&c.focus();},60);
    } else if(view==='pending'){
      authShell(brand+'<div style="text-align:center;padding:6px 0"><div class="auth-tick">'+I('check')+'</div>'+
        '<h1>Almost there</h1><p class="sub">'+esc(data.msg||'Your email is verified. Your account is awaiting approval. We will email you the moment it is active.')+'</p></div>'+
        '<button class="btn btn-ghost btn-block" id="toLogin3" style="margin-top:8px">Back to sign in</button>');
      $('#toLogin3').onclick=function(){authView('login',{});};
    } else {
      authShell(brand+'<h1>Welcome back</h1><p class="sub">Sign in to Vozimi.</p>'+err+ok+
        '<form id="lf"><div class="field"><label>Email</label><input id="liEmail" type="email" autocomplete="username" required value="'+esc(authState.email)+'" placeholder="you@example.com"/></div>'+
        '<div class="field"><label>Password</label><div class="pass-wrap"><input id="liPass" type="password" autocomplete="current-password" required placeholder="Your password"/><button type="button" class="pass-eye" id="liEye">'+I('eye')+'</button></div></div>'+
        '<button class="btn btn-primary btn-block" type="submit" id="liBtn">Sign in '+I('chevronRight')+'</button></form>'+
        '<p class="auth-switch">New here? <a href="#" id="toReg">Create an account</a></p>'+
        '<p class="muted" style="font-size:12.5px;margin-top:8px"><a href="index.html">Back to site</a></p>');
      bindEye('liEye','liPass');
      $('#toReg').onclick=function(e){e.preventDefault();authView('register',{});};
      $('#lf').addEventListener('submit',function(e){e.preventDefault();var b=$('#liBtn');b.disabled=true;b.innerHTML='<span class="spin"></span>';authState.email=$('#liEmail').value.trim();
        BK.api.login(authState.email,$('#liPass').value).then(function(u){S.user=u;boot();}).catch(function(err){
          if(err.code==='OTP_REQUIRED'){authView('otp',{msg:'Please verify your email to continue.'});return;}
          if(err.code==='PENDING'){authView('pending',{msg:'Your account is awaiting approval. We will email you when it is active.'});return;}
          if(err.code==='SUSPENDED'){authView('login',{msg:'Your account has been suspended. Contact support.'});return;}
          authView('login',{msg:err.code==='NETWORK'?'Cannot reach the server. Please try again.':errMsg(err)});});});
    }
  }
  function logout(){BK.api.logout();S.user=null;location.reload();}

  /* ======================= ADMIN ======================= */
  function bootAdmin(){
    applyTheme(getTheme());
    function nb(id,label,icon){return '<button class="nav-item" data-ago="'+id+'">'+I(icon)+'<span>'+label+'</span></button>';}
    function tb(id,label,icon){return '<button class="tab" data-ago="'+id+'">'+I(icon)+'<span>'+label+'</span></button>';}
    $('#app').innerHTML='<div class="shell"><aside class="side">'+
      '<div class="side-brand"><img src="assets/icons/icon.svg" alt=""/> Vozimi <span class="admin-tag">admin</span></div>'+
      '<nav class="nav-group" id="aNav">'+nb('adash','Dashboard','dashboard')+nb('ausers','Users','user')+nb('apay','Payments','invoice')+nb('atickets','Tickets','help')+nb('aai','AI usage','agent')+nb('alog','Activity','ledger')+'</nav>'+
      '<div class="side-foot"><div class="side-user">'+esc(S.user.email)+'</div>'+
        '<button class="nav-item" id="bellBtn">'+I('bell')+'<span>Notifications</span><span class="nbadge" id="anbadgeS"></span></button>'+
        '<button class="nav-item" id="themeToggle" data-theme-btn></button>'+
        '<button class="nav-item" id="logoutBtn">'+I('logout')+'<span>Log out</span></button></div>'+
      '</aside><div class="main">'+
      '<div class="topbar"><span class="tb-brand"><img src="assets/icons/icon.svg" alt=""/> Admin</span>'+
        '<button class="btn-icon nbell" id="bellM" aria-label="Notifications" style="margin-left:auto">'+I('bell')+'<span class="nbadge" id="anbadgeM"></span></button>'+
        '<button class="btn-icon" id="themeM" aria-label="Toggle theme" style="margin-left:4px"></button></div>'+
      '<div class="content"><div id="aView"></div></div>'+
      '<nav class="tabbar" id="aTab">'+tb('adash','Home','dashboard')+tb('ausers','Users','user')+tb('atickets','Tickets','help')+'</nav>'+
      '</div></div>';
    $('#aNav').addEventListener('click',aNavClick);$('#aTab').addEventListener('click',aNavClick);
    $('#logoutBtn').addEventListener('click',logout);
    $('#bellBtn').addEventListener('click',function(e){e.stopPropagation();openNotifPanel();});
    $('#bellM').addEventListener('click',function(e){e.stopPropagation();openNotifPanel();});
    $('#themeToggle').addEventListener('click',function(e){e.stopPropagation();toggleTheme();});
    $('#themeM').addEventListener('click',toggleTheme);refreshThemeBtns();
    adminGo('adash');
    refreshNotif();if(!S._adminNotifTimer)S._adminNotifTimer=setInterval(refreshNotif,60000);
  }
  function aNavClick(e){var b=e.target.closest('[data-ago]');if(b)adminGo(b.getAttribute('data-ago'));}
  function adminGo(route){
    $all('[data-ago]').forEach(function(el){el.classList.toggle('active',el.getAttribute('data-ago')===route);});
    var v=$('#aView');if(!v)return;v.innerHTML='<div class="view" id="aInner"></div>';var root=$('#aInner');
    (route==='ausers'?adminUsers:route==='apay'?adminPayments:route==='atickets'?adminTickets:route==='aai'?adminAi:route==='alog'?adminLog:adminDash)(root);
  }
  function aKpi(label,val,cls){return '<div class="kpi '+(cls||'')+'"><div class="kl">'+esc(label)+'</div><div class="kv">'+val+'</div></div>';}
  function userRow(u){
    var badge='<span class="st-badge st-'+u.status+'">'+esc(u.status.replace('_',' '))+'</span>';
    var acts='<div class="u-acts">';
    if(u.status==='pending'||u.status==='suspended')acts+='<button class="btn btn-sm btn-primary" data-approve="'+u.id+'">'+I('check')+' Approve</button>';
    if(u.status==='active')acts+='<button class="btn btn-sm btn-ghost" data-suspend="'+u.id+'">Suspend</button>';
    acts+='<button class="btn btn-sm btn-logout" data-deluser="'+u.id+'" data-email="'+esc(u.email)+'">'+I('trash')+'</button>';
    acts+='</div>';
    return '<div class="item" style="cursor:pointer" data-udetail="'+u.id+'"><div class="av">'+I('user')+'</div><div class="meta"><div class="t">'+esc(u.name||u.email)+' '+badge+'</div><div class="s">'+esc(u.email)+(u.category?' · '+esc(u.category):'')+' · joined '+fmtDate(u.createdAt)+'</div></div>'+acts+'</div>';
  }
  function bindUserActions(el){
    $all('[data-approve]',el).forEach(function(b){b.onclick=function(e){e.stopPropagation();setUserStatus(b.getAttribute('data-approve'),'active');};});
    $all('[data-suspend]',el).forEach(function(b){b.onclick=function(e){e.stopPropagation();confirmSheet('Suspend this user? They will lose access.',function(){setUserStatus(b.getAttribute('data-suspend'),'suspended');});};});
    $all('[data-deluser]',el).forEach(function(b){b.onclick=function(e){e.stopPropagation();confirmSheet('Delete '+b.getAttribute('data-email')+' and all their data? This cannot be undone.',function(){api('adminDeleteUser',{userId:b.getAttribute('data-deluser')}).then(function(){toast('Deleted','ok');refreshNotif();var a=$('[data-ago].active');adminGo(a?a.getAttribute('data-ago'):'adash');}).catch(function(e2){toast(errMsg(e2),'err');});});};});
    $all('[data-udetail]',el).forEach(function(b){b.onclick=function(){openUserDetail(b.getAttribute('data-udetail'));};});
  }
  function openUserDetail(id){
    openSheet('User','<div id="udBody"><div class="skeleton" style="height:140px"></div></div>',function(root){
      api('adminUserDetail',{userId:id}).then(function(d){var u=d.user,c=d.counts;
        var rows=[['Projects',c.projects],['Transactions',c.txns],['Bookings',c.bookings],['Invoices',c.invoices],['GST files',c.gstFiles],['Loans',c.loans],['Tickets',c.tickets]];
        var recent=(d.recent||[]).map(function(r){return '<div class="s" style="padding:4px 0;border-bottom:1px solid var(--line)">'+tDateTime(r.ts)+' · '+esc(r.action)+' '+esc(r.entity||'')+(r.detail?' · '+esc(r.detail):'')+'</div>';}).join('')||'<p class="muted" style="font-size:13px">No recent activity.</p>';
        var planBadge=u.plan==='pro'?'<span class="st-badge st-active">Pro</span>':(u.plan==='expired'?'<span class="st-badge st-suspended">Pro lapsed</span>':'<span class="st-badge">Free</span>');
        var planLine=u.plan==='pro'?('Pro until '+(u.planUntil?tDateTime(u.planUntil):'?')):(u.plan==='expired'?('Lapsed '+(u.planUntil?fmtDate(u.planUntil):'')):'Free plan');
        $('#udBody',root).innerHTML='<div class="th-head"><div class="t">'+esc(u.name||u.email)+' <span class="st-badge st-'+u.status+'">'+esc(u.status.replace("_"," "))+'</span> '+planBadge+'</div><div class="s">'+esc(u.email)+(u.whatsapp?' · '+esc(u.whatsapp):'')+' · '+esc(u.category||'')+'</div><div class="s">Joined '+fmtDate(u.createdAt)+' · Last active '+(d.lastActive?tDateTime(d.lastActive):'never')+' · AI today '+d.aiToday+'/'+d.aiCap+'</div></div>'+
          '<div class="ud-grid">'+rows.map(function(r){return '<div class="ud-cell"><div class="kv">'+r[1]+'</div><div class="kl">'+r[0]+'</div></div>';}).join('')+'</div>'+
          '<div class="card" style="margin-top:14px;padding:12px"><div class="s" style="margin-bottom:8px"><b>Plan:</b> '+esc(planLine)+(u.hasSub?' · has subscription':'')+'</div>'+
            '<label style="font-size:12px;color:var(--muted)">Grant Pro (no payment) for</label>'+
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="udDays" type="number" min="1" value="30" style="width:90px"/><span class="s">days</span>'+
            '<button class="btn btn-primary btn-sm" id="udGrant">Grant Pro</button>'+(u.plan!=='free'?'<button class="btn btn-ghost btn-sm" id="udRevoke">Revert to Free</button>':'')+'</div></div>'+
          '<div class="field" style="margin-top:14px"><label>Daily AI cap'+(d.aiCapCustom?' (custom)':' (default)')+'</label><div style="display:flex;gap:8px"><input id="udCap" type="number" value="'+d.aiCap+'"/><button class="btn btn-primary btn-sm" id="udCapSave">Set</button></div></div>'+
          '<h3 style="font-size:14px;margin:16px 0 6px">Recent activity</h3>'+recent;
        $('#udCapSave',root).onclick=function(){api('adminSetUserQuota',{userId:id,aiCap:Number($('#udCap',root).value)||0}).then(function(){toast('AI cap set','ok');}).catch(function(e){toast(errMsg(e),'err');});};
        $('#udGrant',root).onclick=function(){var days=Math.max(1,Number($('#udDays',root).value)||30);var btn=this;btn.disabled=true;api('adminSetUserPlan',{userId:id,plan:'pro',days:days}).then(function(){toast('Pro granted for '+days+' days','ok');openUserDetail(id);}).catch(function(e){btn.disabled=false;toast(errMsg(e),'err');});};
        var rv=$('#udRevoke',root);if(rv)rv.onclick=function(){confirmSheet('Revert this user to the Free plan?',function(){api('adminSetUserPlan',{userId:id,plan:'free'}).then(function(){toast('Reverted to Free','ok');openUserDetail(id);}).catch(function(e){toast(errMsg(e),'err');});});};
      }).catch(function(e){$('#udBody',root).innerHTML='<p class="muted">'+esc(errMsg(e))+'</p>';});
    });
  }
  function setUserStatus(userId,status){api('adminSetUserStatus',{userId:userId,status:status}).then(function(){toast(status==='active'?'Approved':'Updated','ok');var a=$('[data-ago].active');adminGo(a?a.getAttribute('data-ago'):'adash');}).catch(function(e){toast(errMsg(e),'err');});}
  function adminDash(root){
    root.innerHTML=pageHead('Admin dashboard','Insights across Vozimi','<button class="btn btn-primary btn-sm" id="aBroadcast">'+I('bell')+' Announcement</button>')+
      '<h3 class="sec-h">Revenue</h3><div class="kpis" id="aRev">'+'<div class="skeleton" style="height:84px"></div>'.repeat(4)+'</div>'+
      '<h3 class="sec-h" style="margin-top:18px">Users</h3><div class="kpis" id="aKpis">'+'<div class="skeleton" style="height:84px"></div>'.repeat(4)+'</div>'+
      '<div class="card" style="margin-top:16px"><div class="card-h"><h3>Recent signups</h3></div><div id="aPending"><div class="skeleton" style="height:90px"></div></div></div>';
    $('#aBroadcast').onclick=function(){openBroadcastSheet();};
    api('adminStats',{}).then(function(d){var s=d.stats;
      var r=$('#aRev');if(r)r.innerHTML=aKpi('Revenue today',money(s.revenueToday),'pos')+aKpi('Payments today',s.paymentsToday)+aKpi('This month',money(s.revenueMonth))+aKpi('All time',money(s.revenueTotal));
      var k=$('#aKpis');if(k)k.innerHTML=aKpi('Total users',s.total)+aKpi('Pro (active)',s.proActive,'pos')+aKpi('Free',s.free)+aKpi('Pro lapsed',s.proLapsed)+aKpi('New 7 days',s.signups7)+aKpi('New 30 days',s.signups30)+aKpi('Suspended',s.suspended)+aKpi('Open tickets',s.openTickets);
    }).catch(function(e){toast(errMsg(e),'err');});
    api('adminListUsers',{sort:'newest'}).then(function(d){var el=$('#aPending');if(!el)return;
      var rows=(d.users||[]).slice(0,8);
      if(!rows.length){el.innerHTML='<div class="empty"><div class="ei">'+I('user')+'</div><h3>No users yet</h3></div>';return;}
      el.innerHTML=rows.map(userRow).join('');bindUserActions(el);}).catch(function(e){toast(errMsg(e),'err');});
  }
  function adminPayments(root){
    root.innerHTML=pageHead('Payments','Completed Razorpay payments')+'<div class="kpis" id="payK">'+'<div class="skeleton" style="height:84px"></div>'.repeat(4)+'</div>'+
      '<div class="card" style="margin-top:16px"><div class="card-h"><h3>All payments</h3></div><div id="payList"><div class="skeleton" style="height:160px"></div></div></div>';
    api('adminPayments',{}).then(function(d){var t=d.totals||{};var k=$('#payK');
      if(k)k.innerHTML=aKpi('Today',money(t.today),'pos')+aKpi('Today count',t.todayCount||0)+aKpi('This month',money(t.month))+aKpi('All time',money(t.all)+' · '+(t.count||0));
      var el=$('#payList');if(!el)return;var ps=d.payments||[];
      el.innerHTML=ps.length?ps.map(function(p){return '<div class="item" style="cursor:default"><div class="av">'+I('invoice')+'</div><div class="meta"><div class="t">'+money(p.amount)+' <span class="muted" style="font-weight:400">· '+esc(p.interval||'')+'</span></div><div class="s">'+esc(p.email||p.userId)+' · '+tDateTime(p.at)+'</div><div class="s muted" style="font-size:11px">'+esc(p.paymentId||'')+'</div></div></div>';}).join(''):'<div class="empty"><div class="ei">'+I('invoice')+'</div><h3>No payments yet</h3><p>Completed payments will appear here.</p></div>';
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openBroadcastSheet(){
    openSheet('Send announcement','<p class="muted" style="margin:0 0 12px;font-size:13.5px">Shows in every user\'s notifications bell. Optionally email all active users too.</p>'+
      '<div class="field"><label>Title</label><input id="brT" placeholder="What is this about?"/></div>'+
      '<div class="field"><label>Message</label><textarea id="brB" rows="4" placeholder="Write your announcement"></textarea></div>'+
      '<label class="switch-row"><input type="checkbox" id="brE"/> <span>Also email all active users</span></label>'+
      '<button class="btn btn-primary btn-block" id="brGo" style="margin-top:14px">'+I('bell')+' Send announcement</button>',function(root){
      $('#brGo',root).onclick=function(){var t=$('#brT',root).value.trim(),b=$('#brB',root).value.trim();if(!t||!b){toast('Add a title and message','err');return;}var btn=$('#brGo',root);btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
        api('adminBroadcast',{title:t,body:b,email:$('#brE',root).checked}).then(function(d){closeSheet();toast('Sent'+(d.emailed?' · emailed '+d.emailed:''),'ok');}).catch(function(e){btn.disabled=false;btn.innerHTML='Send announcement';toast(errMsg(e),'err');});};
    });
  }
  var aFilter='',aQuery='',aSort='newest';
  function adminUsers(root){
    root.innerHTML=pageHead('Users','Manage access')+'<div class="card"><div class="card-h"><span class="seg" id="uFilter">'+
      ['','pending','active','suspended'].map(function(s){return '<button data-f="'+s+'" class="'+(aFilter===s?'on':'')+'">'+(s||'All')+'</button>';}).join('')+'</span>'+
      '<select id="uSort" class="btn-sm" style="width:auto"><option value="newest"'+(aSort==='newest'?' selected':'')+'>Newest</option><option value="oldest"'+(aSort==='oldest'?' selected':'')+'>Oldest</option><option value="name"'+(aSort==='name'?' selected':'')+'>Name</option></select></div>'+
      '<div class="field" style="margin:0 0 12px"><input id="uSearch" placeholder="Search name or email" value="'+esc(aQuery)+'"/></div>'+
      '<div id="uList"><div class="skeleton" style="height:160px"></div></div></div>';
    $('#uFilter').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;aFilter=b.getAttribute('data-f');adminUsers(root);});
    $('#uSort').onchange=function(){aSort=this.value;adminUsers(root);};
    var si;$('#uSearch').addEventListener('input',function(){var v=this.value;clearTimeout(si);si=setTimeout(function(){aQuery=v;loadU();},300);});
    function loadU(){api('adminListUsers',{status:aFilter,q:aQuery,sort:aSort}).then(function(d){var el=$('#uList');if(!el)return;el.innerHTML=d.users.length?d.users.map(userRow).join(''):'<div class="empty"><div class="ei">'+I('user')+'</div><h3>No users</h3></div>';bindUserActions(el);}).catch(function(e){toast(errMsg(e),'err');});}
    loadU();
  }
  function adminAi(root){
    root.innerHTML=pageHead('AI usage','Today, to protect OpenAI spend')+'<div class="kpis" id="aiK"></div><div class="card"><div class="card-h"><h3>Top users today</h3></div><div id="aiList"><div class="skeleton" style="height:120px"></div></div></div>';
    api('adminAiUsage',{}).then(function(d){var k=$('#aiK');if(k)k.innerHTML=aKpi('AI calls today',d.total)+aKpi('Per-user cap',d.cap)+aKpi('Model',d.model);
      var el=$('#aiList');if(!el)return;el.innerHTML=d.rows.length?d.rows.map(function(r){var pct=Math.min(100,Math.round(r.count/d.cap*100));return '<div class="item" style="cursor:default"><div class="meta"><div class="t">'+esc(r.email)+'</div><div class="s">'+r.count+' / '+d.cap+' calls</div><div class="ai-bar"><span style="width:'+pct+'%'+(pct>=90?';background:var(--neg)':'')+'"></span></div></div></div>';}).join(''):'<div class="empty"><div class="ei">'+I('agent')+'</div><h3>No AI usage today</h3></div>';}).catch(function(e){toast(errMsg(e),'err');});
  }
  function adminLog(root){
    root.innerHTML=pageHead('Activity log','Recent actions across the platform')+'<div class="card"><div id="logList"><div class="skeleton" style="height:200px"></div></div></div>';
    api('adminAuditLog',{}).then(function(d){var el=$('#logList');if(!el)return;
      el.innerHTML=d.log.length?d.log.map(function(r){return '<div class="item" style="cursor:default;align-items:flex-start"><div class="meta"><div class="t" style="font-size:13.5px">'+esc(r.action)+' '+esc(r.entity||'')+(r.detail?' <span class="muted" style="font-weight:400">· '+esc(r.detail)+'</span>':'')+'</div><div class="s">'+tDateTime(r.ts)+' · '+esc(r.userId||'')+'</div></div></div>';}).join(''):'<div class="empty"><div class="ei">'+I('ledger')+'</div><h3>No activity yet</h3></div>';}).catch(function(e){toast(errMsg(e),'err');});
  }
  var tFilter='';
  function adminTickets(root){
    root.innerHTML=pageHead('Support tickets','')+'<div class="card"><div class="card-h"><span class="seg" id="tFilter">'+
      [['','All'],['open','Open'],['answered','Answered'],['closed','Closed']].map(function(s){return '<button data-tf="'+s[0]+'" class="'+(tFilter===s[0]?'on':'')+'">'+s[1]+'</button>';}).join('')+'</span></div><div id="tList"><div class="skeleton" style="height:160px"></div></div></div>';
    $('#tFilter').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;tFilter=b.getAttribute('data-tf');adminTickets(root);});
    api('adminListTickets',{status:tFilter}).then(function(d){var el=$('#tList');if(!el)return;
      if(!d.tickets.length){el.innerHTML='<div class="empty"><div class="ei">'+I('help')+'</div><h3>No tickets</h3></div>';return;}
      el.innerHTML=d.tickets.map(function(t){return ticketRow(t,true);}).join('');
      $all('[data-tk]',el).forEach(function(b){b.onclick=function(){openTicketThread(b.getAttribute('data-tk'),true);};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function ticketRow(t,isAdmin){
    var cls=t.status==='closed'?'suspended':t.status==='answered'?'active':'pending';
    var dot=(isAdmin?!t.adminSeen:!t.userSeen)?'<span class="nbadge show" style="margin-left:6px">new</span>':'';
    return '<button class="item tkt-row" data-tk="'+t.id+'" style="width:100%;text-align:left;align-items:flex-start"><div class="av">'+I('mail')+'</div><div class="meta"><div class="t">'+esc(t.subject||'Request')+' <span class="st-badge st-'+cls+'">'+esc(t.status)+'</span>'+dot+'</div><div class="s">'+(isAdmin?esc(t.email)+' · ':'')+fmtDate(t.updatedAt||t.createdAt)+'</div></div>'+I('chevronRight')+'</button>';
  }
  function tDateTime(iso){try{var d=new Date(iso);return fmtDate(iso)+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}catch(e){return fmtDate(iso);}}
  function msgBubble(m,isAdmin){
    var mine=isAdmin?m.sender==='admin':m.sender==='user';
    var who=m.sender==='admin'?'Support':(isAdmin?'User':'You');
    var att=m.hasAtt?'<button class="th-att-view" data-att="'+m.id+'">'+I('doc')+' '+esc(m.attName||'attachment')+'</button>':'';
    return '<div class="th-msg '+(mine?'me':'them')+'"><div class="th-bubble">'+(m.body?esc(m.body).replace(/\n/g,'<br>'):'')+att+'</div><div class="th-meta">'+who+' · '+tDateTime(m.createdAt)+'</div></div>';
  }
  function openTicketThread(id,isAdmin){
    openSheet('Conversation','<div id="thBody"><div class="skeleton" style="height:140px"></div></div>',function(root){
      function render(){
        api('ticketThread',{id:id}).then(function(d){refreshNotif();
          var t=d.ticket,msgs=d.messages||[];
          var cls=t.status==='closed'?'suspended':t.status==='answered'?'active':'pending';
          var head='<div class="th-head"><div class="t">'+esc(t.subject||'Request')+' <span class="st-badge st-'+cls+'">'+esc(t.status)+'</span></div><div class="s">'+esc(t.email)+' · '+fmtDate(t.createdAt)+'</div></div>';
          var bubbles='<div class="th-msgs">'+msgBubble({sender:'user',body:t.message,createdAt:t.createdAt,hasAtt:false},isAdmin);
          msgs.forEach(function(m){bubbles+=msgBubble(m,isAdmin);});
          bubbles+='</div>';
          var canReply=isAdmin||t.status!=='closed';
          var composer=canReply?'<div class="th-compose"><textarea id="thT" rows="2" placeholder="Write a reply..."></textarea><div class="th-tools"><label class="btn btn-ghost btn-sm">'+I('upload')+' Attach<input type="file" id="thF" accept="image/*,application/pdf" style="display:none"/></label><span id="thFName" class="muted" style="font-size:12px;align-self:center"></span><button class="btn btn-primary btn-sm" id="thSend" style="margin-left:auto">'+I('mail')+' Send</button></div></div>':'<p class="muted" style="text-align:center;font-size:13px;margin-top:12px">This ticket is closed. '+(isAdmin?'':'Raise a new one if you still need help.')+'</p>';
          var adminCtrls=isAdmin?'<div class="row2" style="margin-top:12px">'+(t.status==='closed'?'<button class="btn btn-ghost btn-sm" id="thReopen">Reopen</button>':'<button class="btn btn-ghost btn-sm" id="thClose">'+I('check')+' Close / Resolve</button>')+'<button class="btn btn-logout btn-sm" id="thDel">'+I('trash')+' Delete</button></div>':'';
          $('#thBody',root).innerHTML=head+bubbles+composer+adminCtrls;
          var tm=$('.th-msgs',root);if(tm)tm.scrollTop=tm.scrollHeight;
          var attData=null;var fin=$('#thF',root);
          if(fin)fin.onchange=function(){var f=this.files&&this.files[0];if(!f)return;if(f.size>5*1024*1024){toast('Attachment max 5MB','err');this.value='';return;}var rd=new FileReader();rd.onload=function(){attData={name:f.name,mime:f.type||'application/octet-stream',base64:String(rd.result).split(',')[1]};var fn=$('#thFName',root);if(fn)fn.textContent=f.name;};rd.readAsDataURL(f);};
          var sb=$('#thSend',root);if(sb)sb.onclick=function(){var body=$('#thT',root).value.trim();if(!body&&!attData){toast('Write a message','err');return;}sb.disabled=true;sb.innerHTML='<span class="spin"></span>';
            api('postTicketMessage',{id:id,body:body,attachment:attData}).then(function(){attData=null;render();}).catch(function(e){sb.disabled=false;sb.innerHTML=I('mail')+' Send';toast(errMsg(e),'err');});};
          var cl=$('#thClose',root);if(cl)cl.onclick=function(){api('closeTicket',{id:id}).then(function(){toast('Closed','ok');render();}).catch(function(e){toast(errMsg(e),'err');});};
          var ro=$('#thReopen',root);if(ro)ro.onclick=function(){api('reopenTicket',{id:id}).then(function(){toast('Reopened','ok');render();}).catch(function(e){toast(errMsg(e),'err');});};
          var dl=$('#thDel',root);if(dl)dl.onclick=function(){confirmSheet('Delete this ticket and its conversation?',function(){api('adminDeleteTicket',{id:id}).then(function(){closeSheet();toast('Deleted','ok');refreshNotif();var a=$('[data-ago].active');if(a)adminGo(a.getAttribute('data-ago'));});});};
          $all('[data-att]',root).forEach(function(b){b.onclick=function(){var mid=b.getAttribute('data-att');toast('Opening...');api('getTicketAttachment',{messageId:mid}).then(function(dd){var url=URL.createObjectURL(base64ToBlob(dd.base64,dd.mimeType));window.open(url,'_blank');setTimeout(function(){URL.revokeObjectURL(url);},60000);}).catch(function(e){toast(errMsg(e),'err');});};});
        }).catch(function(e){var b=$('#thBody',root);if(b)b.innerHTML='<p class="muted">'+esc(errMsg(e))+'</p>';});
      }
      render();
    });
  }

  /* ======================= BOOT ======================= */
  function boot(){
    $('#auth-root').classList.add('hide');
    $('#app').classList.remove('hide');
    if(S.user&&S.user.role==='admin'){return bootAdmin();}
    renderShell();
    Promise.all([api('getSettings',{}).catch(function(){return{features:{}};}),api('listProjects',{})])
      .then(function(r){
        S.features=r[0].features||S.features;S.projects=r[1].projects||[];
        var saved=getProjId();var active=S.projects.filter(function(p){return p.status!=='archived';});
        S.projectId=(saved&&S.projects.some(function(p){return p.id===saved;}))?saved:((active[0]&&active[0].id)||(S.projects[0]&&S.projects[0].id)||null);
        if(S.projectId)setProjId(S.projectId);
        return S.projectId?loadLookups():null;
      })
      .then(function(){go(S.route);startNotifications();
        if(!langChosen()){setTimeout(function(){openLangModal(true);},400);}
        else if(!S.projects.length){setTimeout(function(){openProjectSheet(true);},500);}
        else{setTimeout(showCoachmark,900);}})
      .catch(function(err){if(err.code==='UNAUTHORIZED')renderAuth('Session expired. Please sign in.');else toast(errMsg(err),'err');});
  }
  function loadLookups(){return api('listLookups',{projectId:S.projectId}).then(function(d){S.lookups=d.lookups;});}
  function lookupNames(kind){return (S.lookups&&S.lookups[kind]?S.lookups[kind]:[]).map(function(x){return x.name;});}
  function loadTx(force){
    if(!force&&S.tx&&S.txProj===S.projectId)return Promise.resolve(S.tx);
    return api('listTransactions',{projectId:S.projectId,limit:2000}).then(function(d){S.tx=d.transactions||[];S.txProj=S.projectId;return S.tx;});
  }
  function invalidateTx(){S.tx=null;}

  /* ---------- offline entry queue ---------- */
  function getQueue(){try{return JSON.parse(localStorage.getItem('bk_queue')||'[]');}catch(e){return [];}}
  function setQueue(q){try{localStorage.setItem('bk_queue',JSON.stringify(q));}catch(e){}}
  function queueWrite(action,payload){var q=getQueue();q.push({action:action,payload:payload,ts:Date.now()});setQueue(q);updateQueueUi();}
  // Try the write; if the device is offline, queue it and resolve optimistically.
  function apiWrite(action,payload){
    if(navigator.onLine===false){queueWrite(action,payload);return Promise.resolve({queued:true});}
    return api(action,payload).catch(function(e){
      if(e&&(e.code==='OFFLINE'||e.code==='NETWORK')){queueWrite(action,payload);return {queued:true};}
      throw e;
    });
  }
  function optimisticTx(payload){ // show a queued transaction immediately in the local list
    if(!S.tx)S.tx=[];
    S.tx.unshift({id:'queued-'+Date.now(),projectId:payload.projectId,type:payload.type,category:payload.category,subCategory:payload.subCategory||'',vendorId:'',vendorName:payload.vendorName||'',amount:Number(payload.amount)||0,date:payload.date||todayStr(),note:(payload.note||'')+' (pending sync)',source:payload.source||'manual'});
  }
  function flushQueue(){
    if(navigator.onLine===false)return Promise.resolve();
    return (function next(){
      var q=getQueue();if(!q.length)return Promise.resolve();
      var item=q[0];
      return BK.api.call(item.action,item.payload).then(function(){var c=getQueue();c.shift();setQueue(c);updateQueueUi();return next();},
        function(e){ if(e&&(e.code==='OFFLINE'||e.code==='NETWORK'))return; // stop; retry later
          // a non-network error (bad data) would loop forever; drop it
          var c=getQueue();c.shift();setQueue(c);updateQueueUi();return next(); });
    })().then(function(){if(S.user&&getQueue().length===0){invalidateTx();if(S.route==='dashboard'||S.route==='ledger'||S.route==='bookings')go(S.route);}});
  }
  function updateQueueUi(){var n=getQueue().length;var b=document.getElementById('connBanner');if(!b)return;
    if(navigator.onLine===false){b.textContent=n?('You are offline. '+n+' entr'+(n===1?'y':'ies')+' will sync when you reconnect.'):'You are offline. Changes will not be saved until you reconnect.';b.classList.add('show');}
    else if(n){b.textContent='Syncing '+n+' saved entr'+(n===1?'y':'ies')+'...';b.classList.add('show');}
    else {b.classList.remove('show');}
  }

  /* ======================= SHELL ======================= */
  function renderShell(){
    $('#app').innerHTML=
      '<div class="shell">'+
        '<aside class="side">'+
          '<div class="side-brand"><img src="assets/icons/icon.svg" alt=""/> Vozimi</div>'+
          '<div class="side-proj"><select id="projSel" aria-label="Project"></select></div>'+
          '<div class="side-search"><button class="nav-item" id="searchBtn">'+I('search')+'<span>Search</span></button></div>'+
          '<nav class="nav-group" id="navGroup">'+NAV.map(function(n){return navBtn(n);}).join('')+'</nav>'+
          '<div class="side-foot">'+
            '<div class="side-user" id="sideUser"></div>'+
            '<button class="nav-item" id="bellBtn">'+I('bell')+'<span>Notifications</span><span class="nbadge" id="nbadgeS"></span></button>'+
            '<button class="nav-item" id="helpBtn">'+I('help')+'<span>Help &amp; Support</span></button>'+
            '<button class="nav-item" id="themeToggle" data-theme-btn></button>'+
            '<button class="nav-item" data-go="settings">'+I('settings')+'<span>Settings</span></button>'+
            '<button class="nav-item" id="logoutBtn">'+I('logout')+'<span>Log out</span></button>'+
          '</div>'+
        '</aside>'+
        '<div class="main">'+
          '<div class="topbar">'+
            '<span class="tb-brand"><img src="assets/icons/icon.svg" alt=""/> Vozimi</span>'+
            '<div class="tb-actions"><button class="btn-icon" id="searchM" aria-label="Search">'+I('search')+'</button>'+
            '<button class="btn-icon nbell" id="bellM" aria-label="Notifications">'+I('bell')+'<span class="nbadge" id="nbadgeM"></span></button>'+
            '<button class="btn-icon" id="acctM" aria-label="Account">'+I('user')+'</button></div>'+
            '<select class="tb-proj" id="projSelM" aria-label="Project"></select>'+
          '</div>'+
          '<div class="content">'+(isReadOnly()?'<div class="ro-banner">'+I('lock')+' <span>Read-only, your Pro plan has lapsed.</span> <button id="roUp">Renew</button></div>':'')+'<div id="view"></div></div>'+
          tabbar()+
        '</div>'+
      '</div>'+
      '<div id="assistant"></div><div id="voiceOverlay" class="hide"></div>';
    $('#sideUser').textContent=S.user?S.user.email:'';
    $('#navGroup').addEventListener('click',navClick);
    $('.side-foot').addEventListener('click',navClick);
    $('#logoutBtn').addEventListener('click',logout);
    $('#tabbar').addEventListener('click',navClick);
    $('#helpBtn').addEventListener('click',function(e){e.stopPropagation();openSupportSheet();});
    $('#bellBtn').addEventListener('click',function(e){e.stopPropagation();openNotifPanel();});
    $('#bellM').addEventListener('click',function(e){e.stopPropagation();openNotifPanel();});
    $('#acctM').addEventListener('click',function(e){e.stopPropagation();go('settings');});
    $('#searchBtn').addEventListener('click',function(e){e.stopPropagation();openGlobalSearch();});
    $('#searchM').addEventListener('click',function(e){e.stopPropagation();openGlobalSearch();});
    var roUp=$('#roUp');if(roUp)roUp.onclick=function(){openUpgrade('readonly');};
    $('#themeToggle').addEventListener('click',function(e){e.stopPropagation();toggleTheme();});
    refreshThemeBtns();
    mountAssistant();
    bindHoldMic($('#micTab'));
  }
  function navBtn(n){return '<button class="nav-item" data-go="'+n[0]+'">'+I(n[2])+'<span>'+n[1]+'</span></button>';}
  function navClick(e){var b=e.target.closest('[data-go]');if(b)go(b.getAttribute('data-go'));}
  function tabbar(){
    function t(id,label,icon){return '<button class="tab" data-go="'+id+'">'+I(icon)+'<span>'+label+'</span></button>';}
    return '<nav class="tabbar" id="tabbar">'+
      t('dashboard','Home','dashboard')+t('ledger','Txns','ledger')+
      '<button class="tab center" id="micTab" aria-label="Tap to speak"><span class="fab">'+I('mic')+'</span></button>'+
      t('reminders','Reminders','bell')+t('more','More','more')+'</nav>';
  }
  function syncProjSel(){
    [$('#projSel'),$('#projSelM')].forEach(function(sel){
      if(!sel)return;
      sel.innerHTML=S.projects.map(function(p){return '<option value="'+p.id+'"'+(p.id===S.projectId?' selected':'')+'>'+esc(p.name)+(p.status==='archived'?' (archived)':'')+'</option>';}).join('')+'<option value="__new">+ New '+pw1()+'</option>';
      sel.onchange=function(){if(sel.value==='__new'){sel.value=S.projectId||'';return openProjectSheet();}setProjId(sel.value);invalidateTx();loadLookups().then(function(){go(S.route);});};
    });
  }
  function setActive(route){
    $all('.nav-item,[data-go].tab').forEach(function(el){el.classList.toggle('active',el.getAttribute('data-go')===route);});
  }

  /* ======================= ROUTER ======================= */
  var VIEWS={dashboard:viewDashboard,ledger:viewLedger,bookings:viewBookings,
    vendors:viewVendors,invoices:viewInvoices,gst:viewGst,loans:viewLoans,reminders:viewReminders,settings:viewSettings};
  function go(route){
    seq++;destroyCharts();
    if(route==='more'){return openMoreMenu();}
    S.route=route;setActive(route);syncProjSel();
    try{var _c=document.querySelector('.content');if(_c)_c.scrollTop=0;window.scrollTo(0,0);}catch(e){}
    var root=$('#view');if(!root){renderShell();root=$('#view');}
    if(!S.projectId&&route!=='settings'){root.innerHTML=noProject();var b=$('#npBtn');if(b)b.onclick=openProjectSheet;return;}
    root.innerHTML='<div class="view" id="viewInner"></div>';
    (VIEWS[route]||viewDashboard)($('#viewInner'),seq);
  }
  function noProject(){return '<div class="view"><div class="empty"><div class="ei">'+I(profile().icon)+'</div><h3>Create your first '+pw1().toLowerCase()+'</h3><p>Every entry belongs to a '+pw1().toLowerCase()+'. Add one to begin.</p><button class="btn btn-primary" id="npBtn" style="margin-top:14px">'+I('plus')+' New '+pw1()+'</button></div></div>';}
  function pageHead(title,sub,actions){return '<div class="page-h"><div><h1>'+esc(title)+'</h1>'+(sub?'<div class="page-sub">'+esc(sub)+'</div>':'')+'</div>'+(actions?'<div class="page-actions">'+actions+'</div>':'')+'</div>';}

  /* ======================= DASHBOARD (client-side) ======================= */
  var chartTrend,chartPie;
  function destroyCharts(){[chartTrend,chartPie].forEach(function(c){try{c&&c.destroy();}catch(e){}});chartTrend=chartPie=null;}
  function viewDashboard(v,mySeq){
    v.innerHTML=pageHead('Dashboard',curProject().name||'',
      '<button class="btn btn-ghost btn-sm" id="dlReport">'+I('download')+' Export PDF</button>'+
      '<button class="btn btn-ghost btn-sm" id="shReport">'+I('whatsapp')+' Share</button>'+
      '<button class="btn btn-ghost btn-sm" id="emReport">'+I('mail')+' Email report</button>')+
      '<div class="kpis" id="kpis">'+kpiSkel()+'</div>'+
      '<div id="cmpBox"></div>'+
      '<div id="budgetBox"></div>'+
      '<div class="card" style="margin-top:16px">'+
        '<div class="card-h"><h3>Cashflow</h3></div>'+
        '<div class="range-bar">'+
          '<span class="seg" id="rangeSeg"><button data-r="1">1D</button><button data-r="7">7D</button><button data-r="30" class="on">30D</button><button data-r="90">90D</button><button data-r="365">1Y</button><button data-r="0">All</button></span>'+
          '<span class="range-dates"><input type="date" id="rFrom" max="'+todayStr()+'" aria-label="From date"/><span class="rto">to</span><input type="date" id="rTo" max="'+todayStr()+'" aria-label="To date"/></span>'+
        '</div>'+
        '<div class="chart-box"><canvas id="trendC"></canvas></div></div>'+
      '<div class="dash-grid">'+
        '<div class="card"><div class="card-h"><h3 id="pieTitle">Where the money went</h3><span class="seg" id="pieSeg"><button data-pm="expense" class="on">Out</button><button data-pm="income">In</button></span></div><div class="chart-box" style="height:230px"><canvas id="pieC"></canvas></div><div class="legend" id="pieLegend"></div></div>'+
        '<div class="card"><div class="card-h"><h3>Projection</h3><span class="sub">from this month</span></div><div id="projBox"></div></div>'+
      '</div>';
    $('#dlReport').onclick=exportReportPdf;$('#emReport').onclick=emailReportFlow;$('#shReport').onclick=shareReport;
    // default 30D, with the date inputs already filled to match (no hide/show, no layout shift)
    var def=rangeFromDays(30);$('#rFrom').value=def.from;$('#rTo').value=def.to;
    $('#rangeSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
      $all('#rangeSeg button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');
      var r=Number(b.getAttribute('data-r'));
      if(r===0){$('#rFrom').value='';$('#rTo').value='';}else{var rg=rangeFromDays(r);$('#rFrom').value=rg.from;$('#rTo').value=rg.to;}
      renderDash(mySeq);});
    function onDate(){$all('#rangeSeg button').forEach(function(x){x.classList.remove('on');});renderDash(mySeq);}
    $('#rFrom').addEventListener('change',onDate);$('#rTo').addEventListener('change',onDate);
    loadTx().then(function(){if(alive(mySeq))renderDash(mySeq);}).catch(function(e){toast(errMsg(e),'err');});
  }
  function kpiSkel(){return '<div class="skeleton" style="height:92px"></div>'.repeat(4);}
  function rangeBounds(){var f=$('#rFrom'),t=$('#rTo');return{from:f?f.value:'',to:t?t.value:''};}
  function renderDash(mySeq){
    if(!alive(mySeq))return;
    var b=rangeBounds();var s=computeSummary(S.tx||[],Number(curProject().landCost)||0,b.from,b.to);
    renderKpis(s);renderTrend(s);renderPie(s);renderProjection(s);renderCompare();renderBudgets();
    _lastSummary=s;
    var seg=$('#pieSeg');if(seg&&!seg._bound){seg._bound=true;seg.addEventListener('click',function(e){var btn=e.target.closest('button');if(!btn)return;pieMode=btn.getAttribute('data-pm');$all('button',seg).forEach(function(x){x.classList.toggle('on',x===btn);});renderPie(_lastSummary);});}
  }
  function renderCompare(){
    var box=$('#cmpBox');if(!box)return;var tx=S.tx||[];
    var now=new Date();var thisM=now.getFullYear()+'-'+p2(now.getMonth()+1);
    var lm=new Date(now.getFullYear(),now.getMonth()-1,1);var lastM=lm.getFullYear()+'-'+p2(lm.getMonth()+1);
    function agg(mk){var inc=0,exp=0;tx.forEach(function(t){if(monthKey(t.date)!==mk)return;var a=Number(t.amount)||0;if(t.type==='INCOME')inc+=a;else if(t.type==='EXPENSE'&&t.category!=='LAND')exp+=a;});return{inc:inc,exp:exp,net:inc-exp};}
    var a=agg(thisM),b=agg(lastM);
    function delta(cur,prev){if(!prev)return cur>0?'<span class="cmp-up">new</span>':'';var pct=Math.round((cur-prev)/Math.abs(prev)*100);return '<span class="'+(pct>=0?'cmp-up':'cmp-down')+'">'+(pct>=0?'+':'')+pct+'%</span>';}
    box.innerHTML='<div class="card cmp-card"><div class="cmp-t">This month vs last</div><div class="cmp-row">'+
      '<div><span class="cmp-l">In</span> '+money(a.inc)+' '+delta(a.inc,b.inc)+'</div>'+
      '<div><span class="cmp-l">Out</span> '+money(a.exp)+' '+delta(a.exp,b.exp)+'</div>'+
      '<div><span class="cmp-l">Net</span> '+money(a.net)+' '+delta(a.net,b.net)+'</div></div></div>';
  }
  function computeSummary(tx,landCost,from,to){
    function inR(d){d=String(d).slice(0,10);if(from&&d<from)return false;if(to&&d>to)return false;return true;}
    var period={income:0,expense:0,byCategory:{},byVendorType:{},incomeByCat:{},byMonth:{}};
    tx.forEach(function(t){
      if(from||to){if(!inR(t.date))return;}
      var amt=Number(t.amount)||0,m=monthKey(t.date);
      if(!period.byMonth[m])period.byMonth[m]={month:m,income:0,expense:0};
      if(t.type==='INCOME'){period.income+=amt;period.byMonth[m].income+=amt;
        var ik=(t.category==='BOOKING'&&t.subCategory)?t.subCategory:(t.category||'Other');period.incomeByCat[ik]=(period.incomeByCat[ik]||0)+amt;}
      else if(t.type==='EXPENSE'){period.byMonth[m].expense+=amt;
        if(t.category!=='LAND'){period.expense+=amt;period.byCategory[t.category]=(period.byCategory[t.category]||0)+amt;
          if(t.category==='VENDOR'){var vt=t.subCategory||'Other';period.byVendorType[vt]=(period.byVendorType[vt]||0)+amt;}}}
    });
    period.net=period.income-period.expense;
    period.byMonth=Object.keys(period.byMonth).sort().map(function(k){return period.byMonth[k];});
    var ti=0,te=0;tx.forEach(function(t){var a=Number(t.amount)||0;if(t.type==='INCOME')ti+=a;else if(t.type==='EXPENSE'&&t.category!=='LAND')te+=a;});
    var profit=ti-(landCost+te);
    // projection from current month
    var bm={};tx.forEach(function(t){var m=monthKey(t.date);if(!m)return;if(!bm[m])bm[m]=0;var a=Number(t.amount)||0;if(t.type==='INCOME')bm[m]+=a;else if(t.type==='EXPENSE'&&t.category!=='LAND')bm[m]-=a;});
    var mk=Object.keys(bm);var avg=mk.length?mk.reduce(function(s,k){return s+bm[k];},0)/mk.length:0;
    var series=[],cum=0,start=monthKey(todayStr());for(var i=0;i<6;i++){cum+=avg;series.push({month:addMonths(start,i),cumulative:Math.round(cum),net:Math.round(avg)});}
    return{period:period,totals:{income:ti,expense:te,landCost:landCost,profit:profit,profitRatio:ti>0?profit/ti:0},
      projection:{monthlyNetAvg:Math.round(avg),series:series},range:{from:from,to:to}};
  }
  function renderKpis(s){
    var p=s.period,t=s.totals;
    $('#kpis').innerHTML=
      '<div class="kpi pos"><div class="kl">'+I('arrowDown')+'In (period)</div><div class="kv">'+money(p.income)+'</div></div>'+
      '<div class="kpi neg"><div class="kl">'+I('arrowUp')+'Out (period)</div><div class="kv">'+money(p.expense)+'</div></div>'+
      '<div class="kpi"><div class="kl">'+I('wallet')+'Net (period)</div><div class="kv">'+money(p.net)+'</div></div>'+
      '<div class="kpi hero"><div class="kl">'+I('trendUp')+'Profit (lifetime)</div><div class="kv">'+money(t.profit)+'</div><div class="kchip">'+Math.round(t.profitRatio*100)+'% margin</div></div>';
  }
  function renderTrend(s){
    var c=$('#trendC');if(!c||!window.Chart)return;
    var labels=s.period.byMonth.map(function(m){return monthLabel(m.month);});
    if(!labels.length){c.parentNode.innerHTML='<div class="empty" style="padding:30px">'+I('trendUp')+'<p>No entries in this range yet.</p></div>';return;}
    chartTrend=new Chart(c,{type:'bar',data:{labels:labels,datasets:[
      {label:'Income',data:s.period.byMonth.map(function(m){return m.income;}),backgroundColor:'#1F9D6B',borderRadius:6,maxBarThickness:30},
      {label:'Expense',data:s.period.byMonth.map(function(m){return m.expense;}),backgroundColor:'#DC5B57',borderRadius:6,maxBarThickness:30}]},
      options:baseOpts(true)});
  }
  var PIE=['#2F2A6B','#1F9D6B','#E0803C','#C8486B','#3E8EAE','#8A6FE0','#C9A227','#5B9E6B','#D0607F','#6B7280'];
  var pieMode='expense';
  function renderPie(s){
    if(!window.Chart||!s)return;
    var box=document.querySelector('.chart-box');if(!box)return;
    var ttl=$('#pieTitle');if(ttl)ttl.textContent=pieMode==='income'?'Where the money came from':'Where the money went';
    var data=pieMode==='income'?s.period.incomeByCat:(Object.keys(s.period.byVendorType).length?s.period.byVendorType:s.period.byCategory);
    var labels=Object.keys(data||{});
    if(!labels.length){try{chartPie&&chartPie.destroy();}catch(e){}chartPie=null;box.innerHTML='<div class="empty" style="padding:20px">'+I('pie')+'<p>No '+(pieMode==='income'?'income':'expenses')+' in this range.</p></div>';var lg=$('#pieLegend');if(lg)lg.innerHTML='';return;}
    if(!$('#pieC'))box.innerHTML='<canvas id="pieC"></canvas>';
    var c=$('#pieC');try{chartPie&&chartPie.destroy();}catch(e){}
    var vals=labels.map(function(k){return data[k];}),total=vals.reduce(function(a,b){return a+b;},0);
    chartPie=new Chart(c,{type:'doughnut',data:{labels:labels.map(prettyCat),datasets:[{data:vals,backgroundColor:labels.map(function(_,i){return PIE[i%PIE.length];}),borderWidth:2,borderColor:chartInk().pieBorder}]},
      options:{cutout:'64%',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(x){return ' '+money(x.raw);}}}}}});
    $('#pieLegend').innerHTML=labels.map(function(k,i){return '<div class="legend-row"><span class="dot" style="background:'+PIE[i%PIE.length]+'"></span><span class="nm">'+esc(prettyCat(k))+'</span><b>'+money(data[k])+'</b><span class="pc">'+Math.round(data[k]/total*100)+'%</span></div>';}).join('');
  }
  function prettyCat(k){return CAT[k]?CAT[k].label:k;}
  function renderProjection(s){
    var pr=s.projection;
    $('#projBox').innerHTML='<div style="font-size:14px;color:var(--txt-2)">Average net per month: <b style="color:'+(pr.monthlyNetAvg>=0?'var(--pos)':'var(--neg)')+'">'+money(pr.monthlyNetAvg)+'</b></div>'+
      '<div class="chips" style="margin-top:12px">'+pr.series.map(function(x){return '<span class="chip">'+monthLabel(x.month)+': <b>'+money(x.cumulative)+'</b></span>';}).join('')+'</div>';
  }
  function isDarkTheme(){return document.documentElement.getAttribute('data-theme')==='dark';}
  function chartInk(){var d=isDarkTheme();return{tick:d?'#AEB0B8':'#8A8A93',grid:d?'rgba(255,255,255,.08)':'#F0F0F4',legend:d?'#CED0D6':'#55555E',pieBorder:d?'#16171B':'#fff'};}
  function baseOpts(legend){var ci=chartInk();return{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:!!legend,position:'bottom',labels:{boxWidth:12,font:{size:12},color:ci.legend}},
      tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+money(c.raw);}}}},
    scales:{x:{grid:{display:false},ticks:{color:ci.tick,font:{size:11}}},
      y:{ticks:{color:ci.tick,font:{size:11},callback:function(v){return curSym()+(Math.abs(v)>=1000?(v/1000)+'k':v);}},grid:{color:ci.grid}}}};}

  /* ======================= VOICE / COMMAND ASSISTANT ======================= */
  // Global utterance handler (from the hold-to-talk mic OR the chatbot text box).
  function handleUtterance(text){
    text=(text||'').trim();
    if(!text){hideVoiceOverlay();toast('Did not catch that. Try again.');return;}
    chatBot.push('user',text);
    if(S.features.ai===false){hideVoiceOverlay();manualConfirm(text);return;}
    chatBot.thinking(true);
    api('interpretBatch',{text:text,projectId:S.projectId}).then(function(d){
      chatBot.thinking(false);hideVoiceOverlay();
      var items=d.items||[];
      if(!items.length){toast("I can't help with that",'err');chatBot.push('bot',"Sorry, I can only help with your project's money, reminders and reports. I'm not able to do that.");return;}
      if(items.length===1){dispatchIntent(items[0],text);}
      else{showBatchReview(items);}
    }).catch(function(e){chatBot.thinking(false);hideVoiceOverlay();
      if(e.code==='AI_DISABLED'){manualConfirm(text);return;}
      if(e.code==='UNKNOWN_ACTION'){ // backend not re-deployed yet: fall back to single interpret
        return api('interpret',{text:text,projectId:S.projectId}).then(function(d){dispatchIntent(d.result,text);}).catch(function(e2){toast(errMsg(e2),'err');chatBot.push('bot',errMsg(e2));});
      }
      toast(errMsg(e),'err');chatBot.push('bot',errMsg(e));});
  }
  function dispatchIntent(r,rawText){
    var d=r.data||{};
    if(r.speak)chatBot.push('bot',r.speak);
    if(r.intent==='OPEN_SECTION'){var map={transactions:'ledger',ledger:'ledger',dashboard:'dashboard',bookings:'bookings',vendors:'vendors',invoices:'invoices',gst:'gst',loans:'loans',reminders:'reminders',settings:'settings'};var sec=String(d.section||'').toLowerCase();
      if(sec==='dues'){go('bookings');setTimeout(openDuesSheet,150);toast('Opening dues','ok');return;}
      if(sec==='search'){openGlobalSearch();return;}
      var route=map[sec];if(route){go(route);toast('Opening '+sec,'ok');}else{toast("I can't open that",'err');}return;}
    if(r.intent==='TOGGLE_THEME'){toggleTheme();toast('Theme switched','ok');return;}
    if(r.intent==='SHOW_NOTIFICATIONS'){openNotifPanel();return;}
    if(r.intent==='CREATE_TICKET'){var subj=d.subject||'Support request',msg=d.message||rawText||'';
      return commandConfirm('Raise a ticket','Send to support: "'+esc(msg)+'"?',function(){return api('support',{email:(S.user&&S.user.email)||'',subject:subj,message:msg,source:'app-voice'});},'Ticket sent');}
    if(r.intent==='ADD_TRANSACTION'){return showTxConfirm(d,rawText,true,r.confidence);}
    if(r.intent==='SET_LAND_COST'){return commandConfirm('Set land cost','Update land cost for '+esc(curProject().name)+' to '+money(d.amount)+'?',function(){
      return api('updateProject',{id:S.projectId,landCost:Number(d.amount)||0}).then(function(res){S.projects=S.projects.map(function(x){return x.id===res.project.id?res.project:x;});});},'Land cost updated');}
    if(r.intent==='ADD_REMINDER'){return openReminderSheet(d);}
    if(r.intent==='ADD_PROJECT'){return commandConfirm('New project','Create project "'+esc(d.name||'')+'"?',function(){
      return api('createProject',{name:d.name,landCost:Number(d.landCost)||0}).then(function(res){S.projects.push(res.project);setProjId(res.project.id);return loadLookups();});},'Project created',function(){invalidateTx();go('dashboard');});}
    if(r.intent==='ADD_VENDOR'){return commandConfirm('New vendor','Add vendor "'+esc(d.name||'')+'"'+(d.vendorType?' ('+esc(d.vendorType)+')':'')+'?',function(){
      return api('createVendor',{projectId:S.projectId,name:d.name,vendorType:d.vendorType||'',phone:d.phone||''});},'Vendor added');}
    if(r.intent==='ADD_VENDOR_TYPE'||r.intent==='ADD_SALARY_ROLE'||r.intent==='ADD_UNIT_TYPE'){
      var kind={ADD_VENDOR_TYPE:'VENDOR_TYPE',ADD_SALARY_ROLE:'SALARY_ROLE',ADD_UNIT_TYPE:'INVENTORY_TYPE'}[r.intent];
      return commandConfirm('New '+kindLabel(kind),'Add "'+esc(d.name||'')+'"?',function(){return api('createLookup',{kind:kind,name:d.name,projectId:S.projectId}).then(loadLookups);},'Added');}
    if(r.intent==='SET_DAILY_REPORT'){go('settings');toast('Configure the daily report below');return;}
    if(r.intent==='SEND_REPORT'){return doSendReport(d);}
    if(r.intent==='QUERY'){return doQuery(d);}
    // off-topic or not understood: generic refusal (the AI is scoped to this CRM only)
    chatBot.push('bot',"Sorry, I can only help with your project's money, reminders and reports. I'm not able to do that.");
    toast("I can't help with that",'err');
  }
  function doSendReport(d){
    if(!S.features.email){chatBot.push('bot','Email reports are off. Add a Resend key on the server to enable them.');toast('Email is off','err');return;}
    var to=(S.user&&S.user.email)||'';
    if(!to){chatBot.push('bot','I do not have an email to send to.');return;}
    var period=(d&&d.period)||'today',from='',until=todayStr(),label='today';
    if(period==='today'){from=todayStr();label='today';}
    else if(period==='yesterday'){from=daysAgo(1);until=daysAgo(1);label='yesterday';}
    else if(period==='this_week'){from=daysAgo(7);label='the last 7 days';}
    else if(period==='this_month'){var d2=new Date();from=d2.getFullYear()+'-'+p2(d2.getMonth()+1)+'-01';label='this month';}
    else if(period==='all'){from='';until='';label='all time';}
    chatBot.thinking(true);
    api('sendReportNow',{projectId:S.projectId,to:to,from:from,until:until}).then(function(){chatBot.thinking(false);chatBot.push('bot','Done. I emailed the '+label+' report to '+to+'.');toast('Report sent','ok');})
      .catch(function(e){chatBot.thinking(false);chatBot.push('bot',errMsg(e));toast(errMsg(e),'err');});
  }
  function doQuery(d){
    var map={today_expense:'todayOut',today_income:'todayIn',this_month:'month',month:'month',open_reminders:'rem',reminders:'rem'};
    var metric=d&&d.metric;
    if(map[metric])return quickQuery(map[metric]);
    if(metric==='profit'||metric==='margin'){
      chatBot.thinking(true);
      return loadTx().then(function(tx){chatBot.thinking(false);
        var ti=0,te=0;tx.forEach(function(t){var a=Number(t.amount)||0;if(t.type==='INCOME')ti+=a;else if(t.type==='EXPENSE'&&t.category!=='LAND')te+=a;});
        var land=Number(curProject().landCost)||0,profit=ti-(land+te);
        chatBot.push('bot','Profit so far: '+money(profit)+' ('+(ti>0?Math.round(profit/ti*100):0)+'% margin). Income '+money(ti)+', land '+money(land)+', expenses '+money(te)+'.');
      }).catch(function(e){chatBot.thinking(false);chatBot.push('bot',errMsg(e));});
    }
    chatBot.push('bot',"I can tell you today's spend or income, this month's numbers, your profit, or open reminders.");
  }
  function manualConfirm(text){showTxConfirm({type:'EXPENSE',category:'VENDOR',subCategory:'',vendorName:'',amount:0,date:todayStr(),note:text||''},text||'',false,1);}

  // ---- multiple entries in one utterance: review all, approve all ----
  function itemSummary(it){
    var d=it.data||{};
    if(it.intent==='ADD_TRANSACTION'){var out=d.type!=='INCOME';return{icon:CI[d.category]||'box',title:d.vendorName||d.subCategory||((CAT[d.category]||{}).label)||'Entry',sub:(out?'Expense':'Income')+(d.subCategory?' · '+d.subCategory:''),amt:(out?'-':'+')+money(d.amount),cls:out?'out':'in'};}
    if(it.intent==='ADD_REMINDER'){return{icon:'bell',title:d.title||'Reminder',sub:'Reminder · '+fmtDate(d.dueDate||todayStr())+' '+(d.time||''),amt:Number(d.amount)>0?money(d.amount):'',cls:''};}
    if(it.intent==='SET_LAND_COST'){return{icon:'land',title:'Set land cost',sub:curProject().name||'',amt:money(d.amount),cls:''};}
    if(it.intent==='ADD_PROJECT'){return{icon:'building',title:'New project: '+(d.name||''),sub:'Project',amt:'',cls:''};}
    if(it.intent==='ADD_VENDOR'){return{icon:'cube',title:d.name||'Vendor',sub:'Vendor'+(d.vendorType?' · '+d.vendorType:''),amt:'',cls:''};}
    if(it.intent==='ADD_VENDOR_TYPE'||it.intent==='ADD_SALARY_ROLE'||it.intent==='ADD_UNIT_TYPE'){var k={ADD_VENDOR_TYPE:'VENDOR_TYPE',ADD_SALARY_ROLE:'SALARY_ROLE',ADD_UNIT_TYPE:'INVENTORY_TYPE'}[it.intent];return{icon:'plus',title:'Add '+kindLabel(k)+': '+(d.name||''),sub:'Category',amt:'',cls:''};}
    return{icon:'box',title:it.intent,sub:'',amt:'',cls:''};
  }
  function executeItem(it){
    var d=it.data||{};
    switch(it.intent){
      case 'ADD_TRANSACTION':
        if(!(Number(d.amount)>0))return Promise.reject(new Error('no amount'));
        if(d.category==='BOOKING')return apiWrite('createBooking',{projectId:S.projectId,customerName:d.customerName||d.vendorName||'Customer',inventoryType:d.subCategory||'',amount:Number(d.amount)||0,bookingDate:d.date||todayStr(),note:d.note||'',customerPhone:''});
        return apiWrite('createTransaction',{projectId:S.projectId,type:d.type,category:d.category,subCategory:d.subCategory||'',vendorName:d.vendorName||'',amount:Number(d.amount)||0,rate:Number(d.rate)||0,quantity:Number(d.quantity)||0,unit:d.unit||'',date:d.date||todayStr(),note:d.note||'',source:'voice',rawText:''});
      case 'ADD_REMINDER':
        return api('createReminder',{projectId:S.projectId,title:d.title,dueDate:d.dueDate,time:d.time,remindBefore:d.remindBefore,recurrence:d.recurrence,amount:Number(d.amount)||0,notify:true});
      case 'SET_LAND_COST':
        return api('updateProject',{id:S.projectId,landCost:Number(d.amount)||0}).then(function(res){S.projects=S.projects.map(function(x){return x.id===res.project.id?res.project:x;});});
      case 'ADD_PROJECT':
        return api('createProject',{name:d.name,landCost:Number(d.landCost)||0}).then(function(res){S.projects.push(res.project);});
      case 'ADD_VENDOR':
        return api('createVendor',{projectId:S.projectId,name:d.name,vendorType:d.vendorType||'',phone:d.phone||''});
      case 'ADD_VENDOR_TYPE':return api('createLookup',{kind:'VENDOR_TYPE',name:d.name,projectId:S.projectId}).then(loadLookups);
      case 'ADD_SALARY_ROLE':return api('createLookup',{kind:'SALARY_ROLE',name:d.name,projectId:S.projectId}).then(loadLookups);
      case 'ADD_UNIT_TYPE':return api('createLookup',{kind:'INVENTORY_TYPE',name:d.name,projectId:S.projectId}).then(loadLookups);
      default:return Promise.resolve();
    }
  }
  function showBatchReview(items){
    var live=items.slice();
    openSheet('Review '+items.length+' entries','<p class="muted" style="margin:0 0 12px;font-size:13px">I understood these from what you said. Remove any you don\'t want, then approve.</p><div id="brBody"></div><button class="btn btn-primary btn-block" id="brApprove" style="margin-top:8px"></button>',function(root){
      function render(){
        var body=$('#brBody',root);
        body.innerHTML=live.map(function(it,idx){var s=itemSummary(it);
          return '<div class="item" style="cursor:default"><div class="av">'+I(s.icon)+'</div><div class="meta"><div class="t">'+esc(s.title)+'</div><div class="s">'+esc(s.sub)+'</div></div>'+(s.amt?'<div class="amt '+s.cls+'">'+s.amt+'</div>':'')+'<button class="br-x" data-x="'+idx+'" aria-label="Remove">'+I('close')+'</button></div>';
        }).join('');
        $all('[data-x]',body).forEach(function(b){b.onclick=function(){live.splice(Number(b.getAttribute('data-x')),1);if(!live.length){closeSheet();return;}render();};});
        var ap=$('#brApprove',root);ap.innerHTML=I('check')+' Approve all ('+live.length+')';
      }
      render();
      $('#brApprove',root).onclick=function(){
        if(!live.length)return;var ap=$('#brApprove',root);ap.disabled=true;ap.innerHTML='<span class="spin"></span>';
        var total=live.length,ok=0,fail=0;
        (function next(i){
          if(i>=total){invalidateTx();closeSheet();
            toast('Saved '+ok+' entr'+(ok===1?'y':'ies')+(fail?', '+fail+' skipped':''),fail?'err':'ok');
            chatBot.push('bot','Saved '+ok+' of '+total+' entries.');
            if(S.route==='dashboard'||S.route==='ledger'||S.route==='reminders')go(S.route);return;}
          executeItem(live[i]).then(function(){ok++;next(i+1);}).catch(function(){fail++;next(i+1);});
        })(0);
      };
    });
  }
  function showTxConfirm(sg,rawText,fromAi,confidence){
    var cats=Object.keys(CAT);
    openSheet(fromAi?'Confirm entry':'New entry',
      (fromAi?'<div class="chip" style="margin-bottom:14px">'+(Number(confidence)>0?Math.round(confidence*100)+'% sure. ':'')+'Edit anything, then save.</div>':'')+
      '<div class="row2"><div class="field"><label>Type</label><select id="cType"><option value="EXPENSE"'+(sg.type!=='INCOME'?' selected':'')+'>Money out</option><option value="INCOME"'+(sg.type==='INCOME'?' selected':'')+'>Money in</option></select></div>'+
      '<div class="field"><label>Category</label><select id="cCat">'+cats.map(function(c){return '<option value="'+c+'"'+(sg.category===c?' selected':'')+'>'+CAT[c].label+'</option>';}).join('')+'</select></div></div>'+
      '<div class="field" id="subWrap"></div><div class="field" id="venWrap"></div>'+
      '<div class="row2"><div class="field"><label>Amount ('+curSym()+')</label><input id="cAmt" type="number" inputmode="decimal" value="'+(sg.amount||'')+'"/></div>'+
      '<div class="field"><label>Date</label><input id="cDate" type="date" value="'+esc(sg.date||todayStr())+'"/></div></div>'+
      '<details style="margin-bottom:12px"><summary class="muted" style="cursor:pointer;font-size:13px">Rate / quantity (optional)</summary>'+
      '<div class="row2" style="margin-top:10px"><div class="field"><label>Rate</label><input id="cRate" type="number" value="'+(sg.rate||'')+'"/></div>'+
      '<div class="field"><label>Qty &amp; unit</label><div style="display:flex;gap:8px"><input id="cQty" type="number" value="'+(sg.quantity||'')+'" style="flex:1"/><input id="cUnit" placeholder="bags" value="'+esc(sg.unit||'')+'" style="flex:1"/></div></div></div></details>'+
      '<div class="field"><label>Note</label><input id="cNote" value="'+esc(sg.note||'')+'"/></div>'+
      '<button class="btn btn-primary btn-block" id="saveTx">'+I('check')+' Save entry</button>',
      function(root){
        function refreshSub(){
          var cat=$('#cCat',root).value,sub=$('#subWrap',root),ven=$('#venWrap',root),lk=CAT[cat].lookup;
          if(lk){var opts=lookupNames(lk);
            // If the AI suggested a type we do not have yet, keep it (it becomes a new category on save).
            var cur=String(sg.subCategory||'').trim();var known=opts.some(function(o){return o.toLowerCase()===cur.toLowerCase();});
            if(cur&&!known)opts=[cur].concat(opts);
            sub.innerHTML='<label>'+(cat==='SALARY'?'Role':cat==='BOOKING'?'Unit type':'Type')+'</label><select id="cSub">'+opts.map(function(o){return '<option value="'+esc(o)+'"'+(cur.toLowerCase()===o.toLowerCase()?' selected':'')+'>'+esc(o)+(cur&&!known&&o===cur?' (new)':'')+'</option>';}).join('')+'<option value="__new">+ Add new</option></select>';
            $('#cSub',root).onchange=function(){if(this.value==='__new')addLookupPrompt(lk,this);};}
          else sub.innerHTML='';
          ven.innerHTML=(cat==='VENDOR')?'<label>Vendor name</label><input id="cVen" placeholder="e.g. '+esc(venEg())+'" value="'+esc(sg.vendorName||'')+'"/>':
            (cat==='BOOKING')?'<label>Customer name</label><input id="cCust" placeholder="e.g. '+esc(custEg())+'" value="'+esc(sg.customerName||sg.vendorName||'')+'"/>':'';
          // A booking is always income (the customer pays you).
          if(cat==='BOOKING'){var ty=$('#cType',root);if(ty)ty.value='INCOME';}
        }
        $('#cCat',root).onchange=refreshSub;refreshSub();
        $('#saveTx',root).onclick=function(){
          var g=function(id){return $('#'+id,root);};
          var payload={projectId:S.projectId,type:g('cType').value,category:g('cCat').value,
            subCategory:g('cSub')?g('cSub').value:'',vendorName:g('cVen')?g('cVen').value.trim():'',
            amount:Number(g('cAmt').value)||0,rate:Number(g('cRate')&&g('cRate').value)||0,
            quantity:Number(g('cQty')&&g('cQty').value)||0,unit:(g('cUnit')&&g('cUnit').value)||'',
            date:g('cDate').value||todayStr(),note:g('cNote').value.trim(),source:fromAi?'voice':'manual',rawText:rawText||''};
          if(!(payload.amount>0)){toast('Enter an amount','err');return;}
          var btn=g('saveTx');btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
          var done=function(res){invalidateTx();closeSheet();var q=res&&res.queued;toast(q?'Saved offline. Will sync when online.':'Saved','ok');chatBot.push('bot',(q?'Saved offline: ':'Saved ')+(payload.type==='INCOME'?'income':'expense')+' of '+money(payload.amount)+'.');if(q&&payload.category!=='BOOKING')optimisticTx(payload);if(S.route==='dashboard'||S.route==='ledger'||S.route==='bookings')go(S.route);};
          var fail=function(e){btn.disabled=false;btn.innerHTML=I('check')+' Save entry';toast(errMsg(e),'err');};
          if(payload.category==='BOOKING'){
            // A booking becomes a real Booking record (which also logs the income), so it shows in Bookings.
            var cust=g('cCust')?g('cCust').value.trim():'';
            if(!cust){toast('Enter the customer name','err');return;}
            apiWrite('createBooking',{projectId:S.projectId,customerName:cust,inventoryType:payload.subCategory||'',amount:payload.amount,bookingDate:payload.date,note:payload.note,customerPhone:''}).then(done).catch(fail);
            return;
          }
          apiWrite('createTransaction',payload).then(done).catch(fail);
        };
      });
  }
  function kindLabel(k){return{VENDOR_TYPE:'vendor type',SALARY_ROLE:'salary role',INVENTORY_TYPE:'unit type',MISC_TYPE:'misc type'}[k]||'item';}
  function kindLabelPlural(k){return{VENDOR_TYPE:'vendor types',SALARY_ROLE:'salary roles',INVENTORY_TYPE:'unit / revenue types',MISC_TYPE:'expense types'}[k]||'items';}
  // Manage (add + delete) a user-extensible category list.
  function openManageLookups(kind){
    if(!isPro()){needPro('category');return;}
    openSheet('Manage '+kindLabelPlural(kind),
      '<p class="muted" style="margin:0 0 12px;font-size:13px">Add your own, or remove ones you do not use. These power the voice entry and dropdowns.</p>'+
      '<div id="lkChips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px"></div>'+
      '<div class="field"><label>Add new</label><div style="display:flex;gap:8px"><input id="lkNew" placeholder="e.g. '+(kind==='VENDOR_TYPE'?esc(venEg()):'New type')+'"/><button class="btn btn-primary" id="lkAdd">'+I('plus')+'</button></div></div>',
      function(root){
        function render(){
          var items=(S.lookups&&S.lookups[kind])||[];
          $('#lkChips',root).innerHTML=items.length?items.map(function(o){return '<span class="chip-del">'+esc(o.name)+'<button data-del="'+o.id+'" aria-label="Remove">'+I('close')+'</button></span>';}).join(''):'<span class="muted" style="font-size:13px">None yet.</span>';
          $all('[data-del]',root).forEach(function(b){b.onclick=function(){api('deleteLookup',{id:b.getAttribute('data-del')}).then(function(){loadLookups().then(render);toast('Removed','ok');}).catch(function(e){toast(errMsg(e),'err');});};});
        }
        render();
        function add(){var n=$('#lkNew',root).value.trim();if(!n)return;api('createLookup',{kind:kind,name:n,projectId:S.projectId}).then(function(){$('#lkNew',root).value='';loadLookups().then(render);toast('Added','ok');}).catch(function(e){toast(errMsg(e),'err');});}
        $('#lkAdd',root).onclick=add;$('#lkNew',root).addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();add();}});
      });
  }
  function openRecurringManage(){
    openSheet('Recurring entries','<div id="rcBody"><div class="skeleton" style="height:100px"></div></div><button class="btn btn-primary btn-block" id="rcAdd" style="margin-top:12px">'+I('plus')+' New recurring entry</button>',function(root){
      function render(){
        api('listRecurring',{projectId:S.projectId}).then(function(d){var rs=d.recurring||[];
          $('#rcBody',root).innerHTML=rs.length?rs.map(function(r){return '<div class="item" style="cursor:default"><div class="av">'+I(r.type==='INCOME'?'arrowDown':'arrowUp')+'</div><div class="meta"><div class="t">'+esc(r.note||prettyCat(r.category))+' <span class="st-badge st-'+(r.active?'active':'pending')+'">'+(r.active?r.frequency:'paused')+'</span></div><div class="s">Next '+fmtDate(r.nextDate)+' · '+money(r.amount)+'</div></div><button class="btn btn-sm btn-ghost" data-rctog="'+r.id+'" data-act="'+(r.active?0:1)+'">'+(r.active?'Pause':'Resume')+'</button><button class="btn-icon btn-sm" data-rcdel="'+r.id+'" style="margin-left:6px">'+I('trash')+'</button></div>';}).join(''):'<p class="muted" style="font-size:13px">None yet. Add rent, salary or an EMI.</p>';
          $all('[data-rctog]',root).forEach(function(b){b.onclick=function(){api('updateRecurring',{id:b.getAttribute('data-rctog'),active:b.getAttribute('data-act')==='1'}).then(render).catch(function(e){toast(errMsg(e),'err');});};});
          $all('[data-rcdel]',root).forEach(function(b){b.onclick=function(){api('deleteRecurring',{id:b.getAttribute('data-rcdel')}).then(render).catch(function(e){toast(errMsg(e),'err');});};});
        }).catch(function(e){$('#rcBody',root).innerHTML='<p class="muted">'+esc(errMsg(e))+'</p>';});
      }
      render();
      $('#rcAdd',root).onclick=function(){openRecurringForm(render);};
    });
  }
  function openRecurringForm(onDone){
    var cats=Object.keys(CAT);
    openSheet('New recurring entry',
      '<div class="row2"><div class="field"><label>Type</label><select id="rcType"><option value="EXPENSE">Money out</option><option value="INCOME">Money in</option></select></div>'+
      '<div class="field"><label>Category</label><select id="rcCat">'+cats.map(function(c){return '<option value="'+c+'">'+CAT[c].label+'</option>';}).join('')+'</select></div></div>'+
      '<div class="field" id="rcVenWrap"><label>Vendor name (optional)</label><input id="rcVen" placeholder="'+esc(venEg())+'"/></div>'+
      '<div class="row2"><div class="field"><label>Amount</label><input id="rcAmt" type="number"/></div>'+
      '<div class="field"><label>Frequency</label><select id="rcFreq"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="daily">Daily</option></select></div></div>'+
      '<div class="field"><label>Next date</label><input id="rcNext" type="date" value="'+todayStr()+'"/></div>'+
      '<div class="field"><label>Note</label><input id="rcNote" placeholder="e.g. Office rent"/></div>'+
      '<button class="btn btn-primary btn-block" id="rcSave">Save recurring</button>',function(root){
      $('#rcSave',root).onclick=function(){var amt=Number($('#rcAmt',root).value)||0;if(!(amt>0)){toast('Enter an amount','err');return;}
        api('createRecurring',{projectId:S.projectId,type:$('#rcType',root).value,category:$('#rcCat',root).value,vendorName:$('#rcVen',root).value.trim(),amount:amt,frequency:$('#rcFreq',root).value,nextDate:$('#rcNext',root).value,note:$('#rcNote',root).value.trim()}).then(function(){closeSheet();toast('Recurring saved','ok');onDone&&onDone();}).catch(function(e){toast(errMsg(e),'err');});};
    });
  }
  function addLookupPrompt(kind,selectEl){
    if(!isPro()){needPro('category');return;}
    openSheet('Add '+kindLabel(kind),'<div class="field"><label>Name</label><input id="lkN" placeholder="e.g. Scaffolding"/></div><button class="btn btn-primary btn-block" id="lkS">Add</button>',function(root){
      $('#lkS',root).onclick=function(){var name=$('#lkN',root).value.trim();if(!name)return;
        api('createLookup',{kind:kind,name:name,projectId:S.projectId}).then(function(){loadLookups().then(function(){
          if(selectEl){var o=document.createElement('option');o.textContent=name;o.selected=true;selectEl.insertBefore(o,selectEl.lastChild);}closeSheet();toast('Added','ok');});}).catch(function(e){toast(errMsg(e),'err');});};
    });
  }

  /* ---- floating assistant: hold-to-talk mic (all views) + desktop chatbot ---- */
  // onboarding hint shown just after login: mobile -> the mic, desktop -> the AI Agent
  function showCoachmark(){
    if($('.coach'))return;
    var isMobile=window.matchMedia&&window.matchMedia('(max-width:899px)').matches;
    var el=document.createElement('div');
    el.className='coach '+(isMobile?'mobile':'desktop');
    el.innerHTML=isMobile
      ? '<div class="ct">'+I('mic')+' Tap to speak</div><div class="cd">Tap the mic, speak to log anything (a payment, income, or a reminder), then tap again to stop.</div>'
      : '<div class="ct">'+I('agent')+' Meet your AI Agent</div><div class="cd">Click here to ask a question, or speak to log entries, set reminders and more.</div>';
    document.body.appendChild(el);
    function dismiss(){if(!el.parentNode)return;el.classList.add('out');document.removeEventListener('pointerdown',dismiss);setTimeout(function(){if(el.parentNode)el.remove();},400);}
    el.addEventListener('click',dismiss);
    setTimeout(function(){document.addEventListener('pointerdown',dismiss);},500);
    setTimeout(dismiss,8000);
  }
  function mountAssistant(){
    var el=$('#assistant');if(!el)return;
    el.innerHTML=
      '<div class="assist-dock">'+
        '<button class="assist-btn chat-btn" id="chatToggle" aria-label="Open AI Agent">'+I('agent')+'</button>'+
      '</div>'+
      '<div class="chat-panel hide" id="chatPanel">'+
        '<div class="chat-h"><span class="chat-title">'+I('agent')+' AI Agent</span><button class="btn-icon" id="chatClose" aria-label="Close">'+I('close')+'</button></div>'+
        '<div class="chat-msgs" id="chatMsgs"></div>'+
        '<div class="chat-quick" id="chatQuick">'+
          '<button class="qchip" data-q="todayOut">Today\'s spend</button>'+
          '<button class="qchip" data-q="todayIn">Today\'s income</button>'+
          '<button class="qchip" data-q="month">This month</button>'+
          '<button class="qchip" data-q="rem">Open reminders</button>'+
        '</div>'+
        '<div class="chat-in"><input id="chatText" placeholder="Type, or click the mic to speak" autocomplete="off"/>'+
          '<button class="btn-icon chat-mic" id="chatMic" aria-label="Click to speak">'+I('mic')+'</button>'+
          '<button class="btn-icon chat-send" id="chatSend" aria-label="Send">'+I('chevronRight')+'</button></div>'+
      '</div>';
    bindClickMic($('#chatMic'),$('#chatText')); // desktop: click to toggle, transcribes into the box
    $('#chatToggle').onclick=chatBot.toggle;
    $('#chatClose').onclick=chatBot.close;
    $('#chatSend').onclick=function(){var t=$('#chatText').value.trim();if(!t)return;$('#chatText').value='';handleUtterance(t);};
    $('#chatText').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();$('#chatSend').click();}});
    $all('.qchip',$('#chatPanel')).forEach(function(b){b.onclick=function(){quickQuery(b.getAttribute('data-q'));};});
  }
  // instant answers computed from loaded data (no AI round-trip)
  function quickQuery(type){
    chatBot.show();
    var labels={todayOut:"Today's spend",todayIn:"Today's income",month:"This month",rem:"Open reminders"};
    chatBot.push('user',labels[type]||'Query');chatBot.thinking(true);
    loadTx().then(function(tx){
      var today=todayStr(),m=monthKey(today);
      function sum(pred){return tx.reduce(function(s,t){return pred(t)?s+(Number(t.amount)||0):s;},0);}
      if(type==='rem'){
        return api('listReminders',{projectId:S.projectId}).then(function(d){chatBot.thinking(false);
          var open=(d.reminders||[]).filter(function(r){return r.status==='open';});
          if(!open.length){chatBot.push('bot','No open reminders. You are all caught up.');return;}
          var next=open.slice().sort(function(a,b){return String(a.dueDate).localeCompare(String(b.dueDate));})[0];
          chatBot.push('bot',open.length+' open reminder'+(open.length>1?'s':'')+'. Next: '+next.title+' on '+fmtDate(next.dueDate)+(Number(next.amount)>0?' ('+money(next.amount)+')':'')+'.');});
      }
      var msg='';
      if(type==='todayOut'){var o=sum(function(t){return t.type==='EXPENSE'&&t.category!=='LAND'&&String(t.date).slice(0,10)===today;});msg='You have spent '+money(o)+' today.';}
      else if(type==='todayIn'){var i=sum(function(t){return t.type==='INCOME'&&String(t.date).slice(0,10)===today;});msg='Income received today: '+money(i)+'.';}
      else if(type==='month'){var mi=sum(function(t){return t.type==='INCOME'&&monthKey(t.date)===m;});var me=sum(function(t){return t.type==='EXPENSE'&&t.category!=='LAND'&&monthKey(t.date)===m;});msg='This month: '+money(mi)+' in, '+money(me)+' out. Net '+money(mi-me)+'.';}
      chatBot.thinking(false);chatBot.push('bot',msg);
    }).catch(function(e){chatBot.thinking(false);chatBot.push('bot',errMsg(e));});
  }
  var chatBot={
    open:false,
    toggle:function(){chatBot.open?chatBot.close():chatBot.show();},
    show:function(){var p=$('#chatPanel');if(!p)return;p.classList.remove('hide');chatBot.open=true;var m=$('#chatMsgs');if(m&&!m.children.length)chatBot.push('bot','Hi, I am your Vozimi AI Agent. Tell me what you paid or earned, ask me to set the land cost or add a reminder, or tap a quick question below.');setTimeout(function(){var i=$('#chatText');i&&i.focus();},60);},
    close:function(){var p=$('#chatPanel');if(p)p.classList.add('hide');chatBot.open=false;},
    push:function(who,text){var m=$('#chatMsgs');if(!m||!text)return;m.appendChild(h('<div class="msg '+who+'">'+esc(text)+'</div>'));m.scrollTop=m.scrollHeight;},
    thinking:function(on){var m=$('#chatMsgs');if(!m)return;var t=$('#chatThink');if(on){if(!t){m.appendChild(h('<div class="msg bot thinking" id="chatThink"><span class="dots"><i></i><i></i><i></i></span></div>'));m.scrollTop=m.scrollHeight;}}else if(t)t.remove();}
  };
  // Tap to start, tap again (or tap the overlay) to stop. No holding.
  function bindHoldMic(btn){
    if(!btn)return;
    if(!BK.voice.supported){btn.addEventListener('click',function(){openTypeSheet('');});return;}
    var rec=false,micTimer=null;
    function stop(){
      if(!rec)return;rec=false;btn.classList.remove('rec');if(micTimer){clearTimeout(micTimer);micTimer=null;}
      BK.voice.stop(); // -> onDone below
    }
    function begin(){
      if(rec)return;
      if(isReadOnly()){toast(featureMsg('readonly'),'err');openUpgrade('readonly');return;}
      rec=true;
      // Free plan: cap each recording length.
      var cap=lim().micSeconds;if(cap>0&&!isPro()){micTimer=setTimeout(function(){if(rec){toast('Free plan: '+cap+'s per entry','ok');stop();}},cap*1000);}
      try{btn.classList.add('rec');openVoiceOverlay();}catch(e2){}
      BK.voice.start(
        function(t){updateVoiceOverlay(t);},
        function(fin){rec=false;btn.classList.remove('rec');
          if(!fin){hideVoiceOverlay();toast('Did not catch that. Try again.');return;}
          setOverlayProcessing();handleUtterance(fin);},
        function(err){rec=false;btn.classList.remove('rec');hideVoiceOverlay();if(err==='not-allowed')toast('Microphone blocked. Allow access or type.','err');}
      );
    }
    btn.addEventListener('click',function(e){e.preventDefault();rec?stop():begin();});
    // Tapping the overlay (anywhere) or its Stop/Type controls.
    var ov=$('#voiceOverlay');
    if(ov&&!ov._bound){ov._bound=true;
      ov.addEventListener('click',function(e){
        if(e.target.closest('#voType'))return; // handled below
        if(rec)stop();
      });
      ov.addEventListener('click',function(e){if(e.target.closest('#voType')){rec=false;btn.classList.remove('rec');BK.voice.stop();hideVoiceOverlay();openTypeSheet('');}});
    }
  }
  // Click-to-toggle mic for the desktop chatbot: first click records (live transcript into
  // the input), second click stops. User reviews, then sends. No hold-release on desktop.
  function bindClickMic(btn,input){
    if(!btn||!input)return;
    if(!BK.voice.supported){btn.style.display='none';return;}
    btn.addEventListener('click',function(){
      if(BK.voice.listening){BK.voice.stop();return;}
      btn.classList.add('rec');input.placeholder='Listening... click the mic to stop';
      BK.voice.start(
        function(t){input.value=t;},
        function(fin){btn.classList.remove('rec');input.placeholder='Type, or click the mic to speak';if(fin)input.value=fin;input.focus();},
        function(err){btn.classList.remove('rec');input.placeholder='Type, or click the mic to speak';if(err==='not-allowed')toast('Microphone blocked. Allow access or type.','err');}
      );
    });
  }
  function openTypeSheet(pre){
    openSheet('What happened?','<div class="field"><textarea id="tyT" rows="2" placeholder="e.g. '+esc(profile().sayEg)+'">'+esc(pre||'')+'</textarea></div>'+
      '<div class="row2"><button class="btn btn-accent" id="tyGo">'+I('sparkle')+' Understand</button><button class="btn btn-ghost" id="tyMan">'+I('edit')+' Manual form</button></div>',function(root){
      setTimeout(function(){var t=$('#tyT',root);t&&t.focus();},60);
      $('#tyGo',root).onclick=function(){var t=$('#tyT',root).value.trim();if(!t){toast('Type something first');return;}closeSheet();if(S.features.ai===false)manualConfirm(t);else handleUtterance(t);};
      $('#tyMan',root).onclick=function(){var t=$('#tyT',root).value.trim();closeSheet();manualConfirm(t);};
    });
  }
  function openVoiceOverlay(){var o=$('#voiceOverlay');if(!o)return;o.classList.remove('hide');
    o.innerHTML='<div class="vo-card"><div class="vo-status" id="voStatus">Listening</div><div class="vo-text" id="voText">Speak now</div>'+
      '<button class="vo-stop-round" id="voStop" aria-label="Stop listening"><span class="vo-stop-sq"></span></button>'+
      '<div class="vo-hint" id="voHint">Tap to stop</div></div>';}
  function updateVoiceOverlay(t){var e=$('#voText');if(e)e.textContent=t||'Speak now';}
  function setOverlayProcessing(){var o=$('#voiceOverlay');if(!o||o.classList.contains('hide'))return;
    var st=$('#voStatus');if(st)st.textContent='Understanding';
    var btn=$('#voStop');if(btn){btn.className='vo-stop-round proc';btn.innerHTML='<span class="spin"></span>';}
    var hint=$('#voHint');if(hint)hint.textContent='One moment';}
  function hideVoiceOverlay(){var o=$('#voiceOverlay');if(!o)return;o.classList.add('hide');o.innerHTML='';}

  /* ======================= LEDGER (monthly) ======================= */
  var ledFilter='all',ledFrom=daysAgo(30),ledTo=todayStr();
  function viewLedger(v,mySeq){
    v.innerHTML=pageHead('Transactions',curProject().name||'')+
      '<div class="card">'+
        '<div class="range-bar">'+
          '<span class="seg" id="ledSeg"><button data-f="all" class="'+(ledFilter==='all'?'on':'')+'">All</button><button data-f="INCOME" class="'+(ledFilter==='INCOME'?'on':'')+'">In</button><button data-f="EXPENSE" class="'+(ledFilter==='EXPENSE'?'on':'')+'">Out</button></span>'+
          '<span class="range-dates"><input type="date" id="lFrom" max="'+todayStr()+'" aria-label="From date" value="'+ledFrom+'"'+(isPro()?'':' disabled')+'/><span class="rto">to</span><input type="date" id="lTo" max="'+todayStr()+'" aria-label="To date" value="'+ledTo+'"'+(isPro()?'':' disabled')+'/><button class="btn btn-ghost btn-sm" id="lClear">Clear</button></span>'+
        '</div>'+
        '<div id="txList"><div class="skeleton" style="height:220px"></div></div></div>';
    $('#ledSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;$all('#ledSeg button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');ledFilter=b.getAttribute('data-f');paint();});
    if(isPro()){$('#lFrom').onchange=function(){ledFrom=this.value;paint();};$('#lTo').onchange=function(){ledTo=this.value;paint();};}
    else{var dr=$('.range-dates');if(dr)dr.onclick=function(){needPro('filters');};}
    $('#lClear').onclick=function(){ledFrom='';ledTo='';if($('#lFrom'))$('#lFrom').value='';if($('#lTo'))$('#lTo').value='';paint();};
    loadTx().then(function(){if(alive(mySeq))paint();}).catch(function(e){toast(errMsg(e),'err');});
    function paint(){
      var rows=(S.tx||[]).filter(function(t){
        if(ledFilter!=='all'&&t.type!==ledFilter)return false;
        var d=String(t.date).slice(0,10);if(ledFrom&&d<ledFrom)return false;if(ledTo&&d>ledTo)return false;return true;});
      var el=$('#txList');if(!el)return;
      if(!rows.length){el.innerHTML='<div class="empty"><div class="ei">'+I('ledger')+'</div><h3>No entries</h3><p>Tap Add entry to record your first one.</p></div>';return;}
      // Free plan: show only the most recent few entries.
      var capped=false,capN=lim().ledgerLimit;
      if(!isPro()&&capN>0&&rows.length>capN){rows=rows.slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date));}).slice(0,capN);capped=true;}
      // group by month
      var groups={};rows.forEach(function(t){var m=monthKey(t.date);(groups[m]=groups[m]||[]).push(t);});
      var html=Object.keys(groups).sort().reverse().map(function(m){
        var g=groups[m];var inc=0,exp=0;g.forEach(function(t){if(t.type==='INCOME')inc+=Number(t.amount)||0;else exp+=Number(t.amount)||0;});
        return '<div class="list-month"><span>'+monthLabel(m)+'</span><span>+'+money(inc)+' / -'+money(exp)+'</span></div>'+g.map(txRow).join('');
      }).join('');
      if(capped)html+='<button class="up-ledger" id="ledUp">'+I('shield')+' Showing your latest '+capN+'. Upgrade to Pro to see your full history.</button>';
      el.innerHTML=html;
      var lu=$('#ledUp',el);if(lu)lu.onclick=function(){needPro('history');};
      $all('.item[data-id]',el).forEach(function(it){it.onclick=function(){openTxSheet(rows.filter(function(t){return t.id===it.getAttribute('data-id');})[0]);};});
    }
  }
  function txRow(t){var out=t.type==='EXPENSE';var title=t.subCategory||(CAT[t.category]||{}).label||t.category;
    return '<div class="item" data-id="'+t.id+'"><div class="av">'+I(CI[t.category]||'box')+'</div>'+
      '<div class="meta"><div class="t">'+esc(title)+(t.note?' <span class="muted">'+esc(t.note)+'</span>':'')+'</div>'+
      '<div class="s">'+fmtDate(t.date)+' · '+(CAT[t.category]||{}).label+(t.source==='voice'?' · voice':'')+'</div></div>'+
      '<div class="amt '+(out?'out':'in')+'">'+(out?'-':'+')+money(t.amount)+'</div></div>';}
  function openTxSheet(t){if(!t)return;
    var cats=Object.keys(CAT);
    openSheet('Edit entry',
      '<div class="row2"><div class="field"><label>Type</label><select id="eType"><option value="EXPENSE"'+(t.type!=='INCOME'?' selected':'')+'>Money out</option><option value="INCOME"'+(t.type==='INCOME'?' selected':'')+'>Money in</option></select></div>'+
      '<div class="field"><label>Category</label><select id="eCat">'+cats.map(function(c){return '<option value="'+c+'"'+(t.category===c?' selected':'')+'>'+CAT[c].label+'</option>';}).join('')+'</select></div></div>'+
      '<div class="field" id="eSubWrap"></div>'+
      '<div class="row2"><div class="field"><label>Amount ('+curSym()+')</label><input id="eAmt" type="number" value="'+(t.amount||'')+'"/></div>'+
      '<div class="field"><label>Date</label><input id="eDate" type="date" max="'+todayStr()+'" value="'+esc(String(t.date).slice(0,10))+'"/></div></div>'+
      '<div class="field"><label>Note</label><input id="eNote" value="'+esc(t.note||'')+'"/></div>'+
      '<button class="btn btn-primary btn-block" id="txSave">'+I('check')+' Save changes</button>'+
      '<button class="btn btn-danger btn-block" id="txDel" style="margin-top:10px">'+I('trash')+' Delete entry</button>',function(root){
        function refreshSub(){var cat=$('#eCat',root).value,w=$('#eSubWrap',root),lk=CAT[cat].lookup;
          if(lk){var opts=lookupNames(lk);w.innerHTML='<label>'+(cat==='SALARY'?'Role':cat==='BOOKING'?'Unit type':'Type')+'</label><select id="eSub">'+opts.map(function(o){return '<option'+(String(t.subCategory).toLowerCase()===o.toLowerCase()?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';}else w.innerHTML='';}
        $('#eCat',root).onchange=refreshSub;refreshSub();
        $('#txSave',root).onclick=function(){var patch={id:t.id,type:$('#eType',root).value,category:$('#eCat',root).value,subCategory:$('#eSub',root)?$('#eSub',root).value:'',amount:Number($('#eAmt',root).value)||0,date:$('#eDate',root).value,note:$('#eNote',root).value.trim()};
          api('updateTransaction',patch).then(function(){invalidateTx();closeSheet();toast('Updated','ok');go(S.route==='dashboard'?'dashboard':'ledger');}).catch(function(e){toast(errMsg(e),'err');});};
        $('#txDel',root).onclick=function(){confirmSheet('Delete this entry?',function(){api('deleteTransaction',{id:t.id}).then(function(){invalidateTx();toast('Deleted','ok');go('ledger');}).catch(function(e){toast(errMsg(e),'err');});});};
      });
  }

  /* ======================= REMINDERS ======================= */
  function viewReminders(v,mySeq){
    v.innerHTML=pageHead('Reminders',curProject().name||'','<button class="btn btn-primary btn-sm" id="addRem">'+I('plus')+' New reminder</button>')+
      '<div class="card"><div id="remList"><div class="skeleton" style="height:120px"></div></div></div>';
    $('#addRem').onclick=function(){openReminderSheet();};
    loadReminders(mySeq);
  }
  function loadReminders(mySeq){
    api('listReminders',{projectId:S.projectId}).then(function(d){
      if(mySeq&&!alive(mySeq))return;var el=$('#remList');if(!el)return;
      if(!d.reminders.length){el.innerHTML='<div class="empty"><div class="ei">'+I('bell')+'</div><h3>No reminders</h3><p>Add payments you must not forget. We can email you and alert you in the app.</p></div>';return;}
      el.innerHTML=d.reminders.map(function(r){var overdue=r.status==='open'&&(String(r.dueDate).slice(0,10)<todayStr());
        return '<div class="item" style="cursor:default"><div class="av">'+I(r.status==='done'?'check':'bell')+'</div>'+
          '<div class="meta"><div class="t" style="'+(r.status==='done'?'color:var(--txt-3);text-decoration:line-through':'')+'">'+esc(r.title)+'</div>'+
          '<div class="s">'+fmtDate(r.dueDate)+' '+esc(r.time||'')+(Number(r.amount)>0?' · '+money(r.amount):'')+(r.recurrence&&r.recurrence!=='none'?' · '+esc(r.recurrence):'')+(overdue?' · <span style="color:var(--neg)">overdue</span>':'')+'</div></div>'+
          (r.status==='done'?'':'<button class="btn btn-sm btn-ghost" data-done="'+r.id+'">'+I('check')+' Done</button>')+
          '<button class="btn-icon btn-sm" data-del="'+r.id+'" style="margin-left:6px">'+I('trash')+'</button></div>';}).join('');
      $all('[data-done]',el).forEach(function(b){b.onclick=function(){api('updateReminder',{id:b.getAttribute('data-done'),status:'done'}).then(function(){loadReminders();});};});
      $all('[data-del]',el).forEach(function(b){b.onclick=function(){confirmSheet('Delete this reminder?',function(){api('deleteReminder',{id:b.getAttribute('data-del')}).then(function(){loadReminders();toast('Deleted','ok');});});};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openReminderSheet(pre){
    pre=pre||{};
    openSheet('New reminder',
      '<div class="field"><label>What for?</label><input id="rT" placeholder="Pay cement vendor" value="'+esc(pre.title||'')+'"/></div>'+
      '<div class="row2"><div class="field"><label>Date</label><input id="rD" type="date" value="'+esc(pre.dueDate||todayStr())+'"/></div>'+
      '<div class="field"><label>Time</label><input id="rTime" type="time" value="'+esc(pre.time||'10:00')+'"/></div></div>'+
      '<div class="row2"><div class="field"><label>Remind before</label><select id="rBefore"><option value="0">At time</option><option value="30"'+((pre.remindBefore==null||pre.remindBefore==30)?' selected':'')+'>30 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></div>'+
      '<div class="field"><label>Repeat</label><select id="rRec"><option value="none">No repeat</option><option value="daily"'+(pre.recurrence==='daily'?' selected':'')+'>Daily</option><option value="weekly"'+(pre.recurrence==='weekly'?' selected':'')+'>Weekly</option><option value="monthly"'+(pre.recurrence==='monthly'?' selected':'')+'>Monthly</option></select></div></div>'+
      '<div class="field"><label>Amount (optional)</label><input id="rA" type="number" value="'+(pre.amount||'')+'"/></div>'+
      '<button class="btn btn-primary btn-block" id="rS">'+I('bell')+' Save reminder</button>',function(root){
        if(pre.remindBefore!=null)$('#rBefore',root).value=String(pre.remindBefore);
        $('#rS',root).onclick=function(){var title=$('#rT',root).value.trim();if(!title){toast('Enter a title');return;}
          api('createReminder',{projectId:S.projectId,title:title,dueDate:$('#rD',root).value,time:$('#rTime',root).value,
            remindBefore:Number($('#rBefore',root).value)||0,recurrence:$('#rRec',root).value,amount:Number($('#rA',root).value)||0,notify:true})
            .then(function(){closeSheet();toast('Reminder set','ok');if(S.route==='reminders')loadReminders();}).catch(function(e){toast(errMsg(e),'err');});};
      });
  }

  /* ======================= VENDORS ======================= */
  function viewVendors(v,mySeq){
    v.innerHTML=pageHead('Vendors',curProject().name||'','<button class="btn btn-primary btn-sm" id="addV">'+I('plus')+' New vendor</button>')+
      '<div class="card"><div id="venList"><div class="skeleton" style="height:140px"></div></div></div>';
    $('#addV').onclick=function(){openVendorSheet();};
    Promise.all([api('listVendors',{projectId:S.projectId}),loadTx().catch(function(){return S.tx||[];})]).then(function(r){if(!alive(mySeq))return;var el=$('#venList');var vendors=r[0].vendors||[],tx=r[1]||S.tx||[];
      if(!vendors.length){el.innerHTML='<div class="empty"><div class="ei">'+I('cube')+'</div><h3>No vendors yet</h3></div>';return;}
      var paid={};tx.forEach(function(t){if(t.vendorId&&t.type==='EXPENSE')paid[t.vendorId]=(paid[t.vendorId]||0)+(Number(t.amount)||0);});
      el.innerHTML=vendors.map(function(v){var tp=paid[v.id]||0;return '<div class="item" data-id="'+v.id+'"><div class="av">'+I('cube')+'</div><div class="meta"><div class="t">'+esc(v.name)+'</div><div class="s">'+esc(v.vendorType||'')+(v.phone?' · '+esc(v.phone):'')+'</div></div>'+(tp>0?'<div class="amt out">'+money(tp)+'</div>':'<span class="chev">'+I('chevronRight')+'</span>')+'</div>';}).join('');
      $all('.item[data-id]',el).forEach(function(it){it.onclick=function(){openVendorSheet(vendors.filter(function(x){return x.id===it.getAttribute('data-id');})[0]);};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openVendorSheet(ven){
    ven=ven||null;var types=lookupNames('VENDOR_TYPE');
    openSheet(ven?'Edit vendor':'New vendor','<div class="field"><label>Name</label><input id="vN" value="'+esc(ven?ven.name:'')+'" placeholder="'+esc(venEg())+'"/></div>'+
      '<div class="field"><label>Type</label><select id="vT">'+types.map(function(t){return '<option'+(ven&&String(ven.vendorType)===t?' selected':'')+'>'+esc(t)+'</option>';}).join('')+'<option value="__new">+ Add new type</option></select></div>'+
      '<div class="row2"><div class="field"><label>Phone</label><input id="vP" value="'+esc(ven?ven.phone:'')+'"/></div><div class="field"><label>GSTIN</label><input id="vG" value="'+esc(ven?ven.gstin:'')+'"/></div></div>'+
      '<button class="btn btn-primary btn-block" id="vS">'+I('check')+' '+(ven?'Save changes':'Save vendor')+'</button>'+
      (ven?'<button class="btn btn-danger btn-block" id="vDel" style="margin-top:10px">'+I('trash')+' Delete vendor</button>':''),function(root){
        $('#vT',root).onchange=function(){if(this.value==='__new')addLookupPrompt('VENDOR_TYPE',this);};
        $('#vS',root).onclick=function(){var n=$('#vN',root).value.trim();if(!n){toast('Enter a name');return;}
          if($('#vT',root).value==='__new'){toast('Pick or add a type','err');return;}
          var payload={projectId:S.projectId,name:n,vendorType:$('#vT',root).value,phone:$('#vP',root).value.trim(),gstin:$('#vG',root).value.trim()};
          var pr=ven?api('updateVendor',{id:ven.id,name:payload.name,vendorType:payload.vendorType,phone:payload.phone,gstin:payload.gstin}):api('createVendor',payload);
          pr.then(function(){closeSheet();toast('Saved','ok');go('vendors');}).catch(function(e){toast(errMsg(e),'err');});};
        if(ven)$('#vDel',root).onclick=function(){confirmSheet('Delete vendor "'+ven.name+'"? This cannot be undone.',function(){api('deleteVendor',{id:ven.id}).then(function(){toast('Deleted','ok');go('vendors');}).catch(function(e){toast(errMsg(e),'err');});});};
      });
  }

  /* ======================= BOOKINGS ======================= */
  function viewBookings(v,mySeq){
    v.innerHTML=pageHead('Bookings',curProject().name||'','<button class="btn btn-ghost btn-sm" id="duesB">'+I('whatsapp')+' Dues</button><button class="btn btn-primary btn-sm" id="addB">'+I('plus')+' New booking</button>')+
      '<div class="card"><div id="bkList"><div class="skeleton" style="height:140px"></div></div></div>';
    $('#addB').onclick=function(){openBookingSheet();};
    $('#duesB').onclick=function(){openDuesSheet();};
    api('listBookings',{projectId:S.projectId}).then(function(d){if(!alive(mySeq))return;var el=$('#bkList');
      if(!d.bookings.length){el.innerHTML='<div class="empty"><div class="ei">'+I('home')+'</div><h3>No bookings yet</h3></div>';return;}
      el.innerHTML=d.bookings.map(function(b){return '<div class="item" data-id="'+b.id+'"><div class="av">'+I('home')+'</div><div class="meta"><div class="t">'+esc(b.customerName)+' · '+esc(b.inventoryType)+'</div><div class="s">'+fmtDate(b.bookingDate)+' · '+esc(b.status)+'</div></div><div class="amt in">'+money(b.amount)+'</div></div>';}).join('');
      $all('.item[data-id]',el).forEach(function(it){it.onclick=function(){openBookingSheet(d.bookings.filter(function(x){return x.id===it.getAttribute('data-id');})[0]);};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  // Who owes you: customers with pending installments, with a one-tap WhatsApp reminder.
  function openDuesSheet(){
    openSheet('Dues (who owes you)','<div id="duesBody"><div class="skeleton" style="height:120px"></div></div>',function(root){
      api('duesSummary',{projectId:S.projectId}).then(function(d){var ds=d.dues||[];var sym=curSym();var biz=(S.business&&S.business.name)||'';
        if(!ds.length){$('#duesBody',root).innerHTML='<div class="empty" style="padding:24px"><div class="ei">'+I('whatsapp')+'</div><h3>No dues</h3><p>Add a payment schedule to a booking to track dues here.</p></div>';return;}
        $('#duesBody',root).innerHTML='<p class="muted" style="margin:0 0 12px;font-size:13.5px">Total outstanding: <b>'+money(d.totalDue)+'</b></p>'+ds.map(function(x){
          return '<div class="item" style="cursor:default"><div class="meta"><div class="t">'+esc(x.customer||'Customer')+'</div><div class="s">Due '+money(x.due)+(x.nextDue?' · next '+fmtDate(x.nextDue):'')+'</div></div>'+(x.phone?'<button class="btn btn-sm btn-primary" data-remind="'+esc(x.phone)+'" data-amt="'+Math.round(x.due)+'" data-cust="'+esc(x.customer||'')+'">'+I('whatsapp')+' Remind</button>':'<span class="muted" style="font-size:12px">no phone</span>')+'</div>';
        }).join('');
        $all('[data-remind]',root).forEach(function(b){b.onclick=function(){
          var phone=b.getAttribute('data-remind').replace(/\D/g,''),amt=sym+Number(b.getAttribute('data-amt')).toLocaleString('en-IN'),cust=b.getAttribute('data-cust');
          var msg=(biz?biz+'\n':'')+'Hello '+cust+', a gentle reminder that '+amt+' is pending on your booking. Please arrange the payment at your convenience. Thank you.';
          window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank');
        };});
      }).catch(function(e){$('#duesBody',root).innerHTML='<p class="muted">'+esc(errMsg(e))+'</p>';});
    });
  }
  function openBookingSheet(bk){
    bk=bk||null;var types=lookupNames('INVENTORY_TYPE');var statuses=['booked','partly-paid','paid','cancelled'];
    openSheet(bk?'Edit booking':'New booking','<div class="field"><label>Customer name</label><input id="bN" value="'+esc(bk?bk.customerName:'')+'" placeholder="'+esc(custEg())+'"/></div>'+
      '<div class="row2"><div class="field"><label>Unit</label><select id="bT">'+types.map(function(t){return '<option'+(bk&&String(bk.inventoryType)===t?' selected':'')+'>'+esc(t)+'</option>';}).join('')+'</select></div><div class="field"><label>Amount</label><input id="bA" type="number" value="'+(bk?bk.amount:'')+'"/></div></div>'+
      (bk?'<div class="row2"><div class="field"><label>Status</label><select id="bStatus">'+statuses.map(function(s){return '<option'+(bk.status===s?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div><div class="field"><label>Phone</label><input id="bP" value="'+esc(bk.customerPhone||'')+'"/></div></div>'
        :'<div class="row2"><div class="field"><label>Date</label><input id="bD" type="date" max="'+todayStr()+'" value="'+todayStr()+'"/></div><div class="field"><label>Phone</label><input id="bP"/></div></div>')+
      (bk?'':'<p class="muted" style="font-size:12.5px">Saving also records this as project income.</p>')+
      '<button class="btn btn-primary btn-block" id="bS">'+I('check')+' '+(bk?'Save changes':'Save booking')+'</button>'+
      (bk?'<button class="btn btn-ghost btn-block" id="bInst" style="margin-top:10px">'+I('wallet')+' Payment schedule</button>':'')+
      (bk?'<button class="btn btn-danger btn-block" id="bDel" style="margin-top:10px">'+I('trash')+' Delete booking</button>':''),function(root){
        if(bk)$('#bInst',root).onclick=function(){openInstallments(bk);};
        $('#bS',root).onclick=function(){var n=$('#bN',root).value.trim();if(!n){toast('Enter a name');return;}
          if(bk){api('updateBooking',{id:bk.id,customerName:n,inventoryType:$('#bT',root).value,amount:Number($('#bA',root).value)||0,status:$('#bStatus',root).value,customerPhone:$('#bP',root).value.trim()}).then(function(){closeSheet();toast('Saved','ok');go('bookings');}).catch(function(e){toast(errMsg(e),'err');});}
          else{api('createBooking',{projectId:S.projectId,customerName:n,inventoryType:$('#bT',root).value,amount:Number($('#bA',root).value)||0,bookingDate:$('#bD',root).value,customerPhone:$('#bP',root).value.trim()}).then(function(){invalidateTx();closeSheet();toast('Saved','ok');go('bookings');}).catch(function(e){toast(errMsg(e),'err');});}};
        if(bk)$('#bDel',root).onclick=function(){confirmSheet('Delete this booking for '+bk.customerName+'? The linked income entry stays in your ledger; remove it there if needed.',function(){api('deleteBooking',{id:bk.id}).then(function(){toast('Deleted','ok');go('bookings');}).catch(function(e){toast(errMsg(e),'err');});});};
      });
  }

  /* ======================= INVOICES ======================= */
  function viewInvoices(v,mySeq){
    v.innerHTML=pageHead('Invoices',curProject().name||'','<button class="btn btn-primary btn-sm" id="addI">'+I('plus')+' New invoice</button>')+
      '<div class="card"><div id="invList"><div class="skeleton" style="height:120px"></div></div></div>';
    $('#addI').onclick=function(){openInvoiceSheet();};
    loadBusiness();
    api('listInvoices',{projectId:S.projectId}).then(function(d){if(!alive(mySeq))return;var el=$('#invList');
      el.innerHTML=d.invoices.length?d.invoices.map(function(inv){return '<div class="item" data-inv=\''+esc(JSON.stringify(inv))+'\'><div class="av">'+I('doc')+'</div><div class="meta"><div class="t">'+esc(inv.number)+' · '+esc(inv.customerName)+'</div><div class="s">'+fmtDate(inv.date)+'</div></div><div class="amt">'+money(inv.total)+'</div></div>';}).join(''):'<div class="empty"><div class="ei">'+I('doc')+'</div><h3>No invoices yet</h3></div>';
      $all('.item[data-inv]',el).forEach(function(row){row.onclick=function(){openInvoiceActions(JSON.parse(row.getAttribute('data-inv')));};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openInvoiceActions(inv){
    openSheet('Invoice '+(inv.number||''),'<p class="muted" style="margin:0 0 14px">'+esc(inv.customerName||'')+' · '+money(inv.total)+' · '+fmtDate(inv.date)+'</p>'+
      '<button class="btn btn-primary btn-block" id="ivSend">'+I('mail')+' Email / resend invoice</button>'+
      '<button class="btn btn-ghost btn-block" id="ivPdf" style="margin-top:10px">'+I('download')+' Download PDF</button>'+
      '<button class="btn btn-danger btn-block" id="ivDel" style="margin-top:10px">'+I('trash')+' Delete invoice</button>',function(root){
        $('#ivSend',root).onclick=function(){closeSheet();openInvoiceSend(inv);};
        $('#ivPdf',root).onclick=function(){invoicePdf(inv);};
        $('#ivDel',root).onclick=function(){confirmSheet('Delete invoice '+(inv.number||'')+'?',function(){api('deleteInvoice',{id:inv.id}).then(function(){toast('Deleted','ok');go('invoices');}).catch(function(e){toast(errMsg(e),'err');});});};
      });
  }
  function openInvoiceSheet(){
    loadBusiness().then(function(b){
      if(!bizReady(b)){
        openSheet('Set your business details first','<p class="muted" style="margin:0 0 14px;font-size:13.5px">Invoices show your business name, address'+(b.gstEnabled?' and GSTIN':'')+'. Add them once and every invoice looks professional.</p>'+
          '<button class="btn btn-primary btn-block" id="goBiz">'+I('building')+' Add business details</button>',function(root){$('#goBiz',root).onclick=function(){closeSheet();openBusinessSheet();};});
        return;
      }
      openInvoiceForm();
    });
  }
  function openInvoiceForm(){
    openSheet('New invoice',
      '<div class="field"><label>From booking (optional)</label><select id="iBk"><option value="">New customer</option></select><span class="field-hint">Pick a booking to fill the customer name and WhatsApp number.</span></div>'+
      '<div class="field"><label>Customer</label><input id="iN" placeholder="'+esc(custEg())+'"/></div>'+
      '<div class="row2"><div class="field"><label>WhatsApp number</label><input id="iWa" type="tel" inputmode="tel" placeholder="+91 98765 43210"/></div>'+
      '<div class="field"><label>Email</label><input id="iEm" type="email" placeholder="customer@example.com"/></div></div>'+
      '<div id="items"></div><button class="btn btn-ghost btn-sm" id="addItem" style="margin:4px 0 14px">'+I('plus')+' Add line</button>'+
      '<label class="switch-row" style="margin-bottom:12px"><input type="checkbox" id="iEmailNow" checked/> <span>Email the invoice to the customer now</span></label>'+
      '<button class="btn btn-primary btn-block" id="iS">'+I('check')+' Create invoice</button>',function(root){
      var bkMap={};
      api('listBookings',{projectId:S.projectId}).then(function(d){if(!d.bookings)return;var sel=$('#iBk',root);d.bookings.forEach(function(bk){bkMap[bk.id]=bk;sel.appendChild(h('<option value="'+esc(bk.id)+'">'+esc(bk.customerName)+(bk.customerPhone?' · '+esc(bk.customerPhone):'')+'</option>'));});}).catch(function(){});
      $('#iBk',root).onchange=function(){var bk=bkMap[this.value];if(!bk)return;$('#iN',root).value=bk.customerName||'';$('#iWa',root).value=bk.customerPhone||'';};
      function addItem(){root.querySelector('#items').appendChild(h('<div class="row2" style="gap:8px;margin-bottom:8px"><input placeholder="Description" class="it-d"/><div style="display:flex;gap:6px"><input type="number" placeholder="Qty" class="it-q" style="width:62px"/><input type="number" placeholder="Rate" class="it-r" style="flex:1"/></div></div>'));}
      addItem();$('#addItem',root).onclick=addItem;
      $('#iS',root).onclick=function(){var name=$('#iN',root).value.trim();if(!name){toast('Enter customer');return;}
        var wa=$('#iWa',root).value.trim();if(wa&&!waValid(wa)){toast('Enter a valid WhatsApp number with country code','err');return;}
        var items=$all('#items .row2',root).map(function(r){var q=Number($('.it-q',r).value)||0,rate=Number($('.it-r',r).value)||0;return{desc:$('.it-d',r).value.trim(),qty:q,rate:rate,amount:q*rate};}).filter(function(it){return it.desc&&it.amount;});
        if(!items.length){toast('Add at least one line');return;}
        var bkId=$('#iBk',root).value||'';var em=$('#iEm',root).value.trim();var emailNow=$('#iEmailNow',root).checked;
        var btn=$('#iS',root);btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
        api('createInvoice',{projectId:S.projectId,customerName:name,customerPhone:wa,customerEmail:em,bookingId:bkId,date:todayStr(),items:items}).then(function(d){closeSheet();invoicePdf(d.invoice);
          if(emailNow&&em&&!isPro()){toast('Invoice created. Emailing invoices is a Pro feature.','ok');setTimeout(function(){openUpgrade('invoiceEmail');},400);}
          else if(emailNow&&em){toast('Invoice created, emailing...','ok');emailInvoiceTo(d.invoice,em).then(function(){toast('Invoice emailed to '+em,'ok');}).catch(function(e){toast('Created, but email failed: '+errMsg(e),'err');openInvoiceSend(d.invoice);});}
          else if(emailNow&&!em){toast('Invoice created. Open it to email the customer.','ok');}
          else{toast('Invoice created','ok');}
          go('invoices');
        }).catch(function(e){btn.disabled=false;btn.innerHTML=I('check')+' Create invoice';toast(errMsg(e),'err');});};
    });
  }
  function invGrandTotal(inv){var sub=Number(inv.total)||0;var b=S.business||{};return Math.round(b.gstEnabled?sub*(1+(Number(b.gstRate)||18)/100):sub);}
  function buildInvoiceDoc(inv){
    var items;try{items=typeof inv.items==='string'?JSON.parse(inv.items):(inv.items||[]);}catch(e){items=[];}
    var b=S.business||{};var sym=curSym();var W=210;
    var doc=new window.jspdf.jsPDF();var hc=[15,118,110]; // teal header
    function money0(v){return sym+Math.round(v||0).toLocaleString('en-IN');}
    // header band
    doc.setFillColor(hc[0],hc[1],hc[2]);doc.rect(0,0,W,40,'F');
    var tx=14;
    if(b.logo){try{doc.addImage(b.logo,'PNG',14,9,22,22);tx=42;}catch(e){try{doc.addImage(b.logo,'JPEG',14,9,22,22);tx=42;}catch(e2){}}}
    doc.setTextColor(255,255,255);doc.setFont(undefined,'bold');doc.setFontSize(17);doc.text(b.name||'Your Business',tx,17);
    doc.setFont(undefined,'normal');doc.setFontSize(8.5);var hy=23;
    String(b.address||'').split('\n').slice(0,2).forEach(function(l){if(l)doc.text(l.slice(0,60),tx,hy);hy+=4;});
    var cl=[b.phone,b.email].filter(Boolean).join('   ');if(cl){doc.text(cl,tx,hy);hy+=4;}
    if(b.gstEnabled&&b.gstin)doc.text('GSTIN: '+b.gstin,tx,hy);
    doc.setFont(undefined,'bold');doc.setFontSize(22);doc.text('INVOICE',W-14,17,{align:'right'});
    doc.setFont(undefined,'normal');doc.setFontSize(9);doc.text('No: '+(inv.number||''),W-14,25,{align:'right'});doc.text('Date: '+(inv.date||''),W-14,30,{align:'right'});
    // bill to
    doc.setTextColor(30,30,30);var y=54;doc.setFont(undefined,'bold');doc.setFontSize(9.5);doc.text('BILL TO',14,y);
    doc.setFont(undefined,'normal');doc.setFontSize(11);doc.text(String(inv.customerName||''),14,y+6);
    if(inv.customerPhone)doc.text(String(inv.customerPhone),14,y+11);
    // items table header
    y+=24;doc.setFillColor(hc[0],hc[1],hc[2]);doc.rect(14,y-6,W-28,9,'F');doc.setTextColor(255,255,255);doc.setFont(undefined,'bold');doc.setFontSize(9.5);
    doc.text('DESCRIPTION',16,y);doc.text('QTY',120,y,{align:'right'});doc.text('RATE',152,y,{align:'right'});doc.text('AMOUNT',W-16,y,{align:'right'});
    y+=9;doc.setTextColor(45,45,45);doc.setFont(undefined,'normal');doc.setFontSize(10);
    items.forEach(function(it,i){if(i%2){doc.setFillColor(244,247,247);doc.rect(14,y-5,W-28,8,'F');}
      doc.text(String(it.desc||'').slice(0,54),16,y);doc.text(String(it.qty||''),120,y,{align:'right'});doc.text(money0(it.rate),152,y,{align:'right'});doc.text(money0(it.amount),W-16,y,{align:'right'});y+=8;});
    // totals
    y+=4;var sub=Number(inv.total)||0,lx=132,rx=W-16;
    function totLine(l,v,bold){doc.setFont(undefined,bold?'bold':'normal');doc.text(l,lx,y);doc.text(money0(v),rx,y,{align:'right'});y+=7;}
    doc.setFontSize(10);doc.setTextColor(60,60,60);totLine('Subtotal',sub);
    var grand=sub;
    if(b.gstEnabled){var rate=Number(b.gstRate)||18,gst=sub*rate/100;totLine('CGST ('+(rate/2)+'%)',gst/2);totLine('SGST ('+(rate/2)+'%)',gst/2);grand=sub+gst;}
    doc.setDrawColor(hc[0],hc[1],hc[2]);doc.setLineWidth(.4);doc.line(lx,y-3,rx,y-3);y+=2;doc.setFontSize(12.5);doc.setTextColor(hc[0],hc[1],hc[2]);totLine('TOTAL',grand,true);
    // signature
    var sy=Math.max(y+18,252);doc.setTextColor(90,90,90);
    if(b.sign){try{doc.addImage(b.sign,'PNG',W-62,sy-18,42,16);}catch(e){try{doc.addImage(b.sign,'JPEG',W-62,sy-18,42,16);}catch(e2){}}}
    doc.setDrawColor(180,180,180);doc.setLineWidth(.3);doc.line(W-62,sy,W-14,sy);doc.setFontSize(9);doc.text('Authorised signatory',W-14,sy+5,{align:'right'});
    if(b.name)doc.text('For '+b.name,W-14,sy+10,{align:'right'});
    doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text('Generated with Vozimi',14,289);
    return doc;
  }
  function invoicePdf(inv){
    if(!window.jspdf){toast('PDF engine still loading');return;}
    buildInvoiceDoc(inv).save((inv.number||'invoice')+'.pdf');
  }
  function emailInvoiceTo(inv,em){
    if(!isPro())return Promise.reject({code:'UPGRADE',message:featureMsg('invoiceEmail')});
    if(!window.jspdf)return Promise.reject({code:'PDF',message:'PDF engine still loading, try again'});
    var b64='';try{b64=buildInvoiceDoc(inv).output('datauristring').split(',')[1];}catch(e){}
    if(!b64)return Promise.reject({code:'BAD_FILE',message:'Could not build the invoice PDF'});
    return api('emailInvoice',{id:inv.id,to:em,pdfBase64:b64,currencySymbol:curSym(),grandTotal:invGrandTotal(inv)});
  }
  // Email (with PDF) or download. Email is sent automatically on creation; this is for
  // resending / nudging the customer later.
  function openInvoiceSend(inv){
    loadBusiness().then(function(){
    openSheet('Invoice '+(inv.number||''),
      '<p class="muted" style="margin:0 0 14px;font-size:13.5px">Email sends the invoice PDF to the customer. Use it to resend or nudge any time.</p>'+
      '<div class="field"><label>Customer email</label><input id="snEm" type="email" placeholder="customer@example.com" value="'+esc(inv.customerEmail||'')+'"/></div>'+
      '<button class="btn btn-primary btn-block" id="snEmBtn">'+I('mail')+' Email invoice</button>'+
      '<button class="btn btn-ghost btn-block" id="snPdf" style="margin-top:10px">'+I('download')+' Download PDF</button>',function(root){
        $('#snPdf',root).onclick=function(){invoicePdf(inv);};
        $('#snEmBtn',root).onclick=function(){
          if(!isPro()){needPro('invoiceEmail');return;}
          var em=$('#snEm',root).value.trim();if(!em){toast('Enter the customer email','err');return;}
          var btn=$('#snEmBtn',root);btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
          emailInvoiceTo(inv,em).then(function(){btn.disabled=false;btn.innerHTML=I('mail')+' Email invoice';toast('Invoice emailed to '+em,'ok');}).catch(function(e){btn.disabled=false;btn.innerHTML=I('mail')+' Email invoice';if(e&&e.code==='UPGRADE')needPro('invoiceEmail');else toast(errMsg(e),'err');});
        };
      });
    });
  }

  /* ======================= GST VAULT (multi-upload) ======================= */
  function viewGst(v,mySeq){
    v.innerHTML=pageHead('GST invoices',curProject().name||'',
      '<button class="btn btn-primary btn-sm" id="upG">'+I('upload')+' Upload</button>'+
      '<button class="btn btn-ghost btn-sm" id="bundleG">'+I('download')+' Bundle selected</button>')+
      '<div class="card" id="gstTax" style="margin-bottom:14px"><div class="card-h"><h3>Tax summary</h3><span class="sub">all time</span></div><div class="kpis" id="gstTaxK"><div class="skeleton" style="height:84px"></div></div></div>'+
      '<div class="card"><div id="gstList"><div class="skeleton" style="height:140px"></div></div></div>';
    var selected={};
    $('#upG').onclick=function(){openGstUpload();};
    // Tax summary: output GST (on your invoices) vs input GST (on purchase invoices you uploaded).
    Promise.all([loadBusiness().catch(function(){return{};}),api('listInvoices',{projectId:S.projectId}).catch(function(){return{invoices:[]};}),api('listGstInvoices',{projectId:S.projectId}).catch(function(){return{gstInvoices:[]};})]).then(function(r){
      var b=r[0]||{},invs=r[1].invoices||[],gsts=r[2].gstInvoices||[];
      var rate=Number(b.gstRate)||18;
      var output=b.gstEnabled?invs.reduce(function(s,i){return s+(Number(i.total)||0)*rate/100;},0):0;
      var input=gsts.reduce(function(s,g){return s+(Number(g.gst)||0);},0);
      var net=output-input;var k=$('#gstTaxK');if(!k)return;
      k.innerHTML=aKpi('Output GST (sales)',money(output),'')+aKpi('Input GST (purchases)',money(input),'')+aKpi(net>=0?'Net payable':'Net credit',money(Math.abs(net)),net>=0?'neg':'pos');
    });
    $('#bundleG').onclick=function(){var ids=Object.keys(selected).filter(function(k){return selected[k];});if(!ids.length){toast('Select invoices first');return;}
      // Encrypted files can't be zipped on the server (it has no key), so download them individually, decrypted.
      if(ENC.enabled){toast('Downloading '+ids.length+' file'+(ids.length===1?'':'s')+'...');ids.forEach(function(id,i){setTimeout(function(){openGstFile(id,true);},i*600);});return;}
      toast('Preparing ZIP...');api('bundleGstInvoices',{ids:ids}).then(function(d){downloadBase64(d.base64,d.fileName,'application/zip');}).catch(function(e){toast(errMsg(e),'err');});};
    api('listGstInvoices',{projectId:S.projectId}).then(function(d){if(!alive(mySeq))return;var el=$('#gstList');
      if(!d.gstInvoices.length){el.innerHTML='<div class="empty"><div class="ei">'+I('folder')+'</div><h3>No GST invoices</h3><p>Upload purchase invoices from your vendors. You can upload many at once.</p></div>';return;}
      el.innerHTML=d.gstInvoices.map(function(g){return '<div class="item" style="cursor:default"><input type="checkbox" data-sel="'+g.id+'" style="width:18px;height:18px;flex:none"/><div class="meta"><div class="t">'+esc(g.number||g.fileName)+'</div><div class="s">'+fmtDate(g.date)+(Number(g.amount)>0?' · '+money(g.amount):'')+'</div></div><button class="btn btn-sm btn-ghost" data-view="'+g.id+'">View</button><button class="btn-icon btn-sm" data-del="'+g.id+'" style="margin-left:6px">'+I('trash')+'</button></div>';}).join('');
      $all('[data-sel]',el).forEach(function(c){c.onchange=function(){selected[c.getAttribute('data-sel')]=c.checked;};});
      $all('[data-view]',el).forEach(function(b){b.onclick=function(){viewGstFile(b.getAttribute('data-view'));};});
      $all('[data-del]',el).forEach(function(b){b.onclick=function(){confirmSheet('Delete this GST invoice and its file?',function(){api('deleteGstInvoice',{id:b.getAttribute('data-del')}).then(function(){go('gst');toast('Deleted','ok');});});};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openGstUpload(){
    encEnsure().then(function(){ // unlock first if encryption is on (so we don't swap sheets mid-upload)
    api('listVendors',{projectId:S.projectId}).then(function(d){var vendors=d.vendors;
      var encOn=ENC.enabled&&encUnlocked();
      openSheet('Upload GST invoices','<div class="field"><label>Vendor</label><select id="gV">'+(vendors.length?vendors.map(function(v){return '<option value="'+v.id+'">'+esc(v.name)+'</option>';}).join(''):'<option value="">(add a vendor first)</option>')+'</select></div>'+
        '<div class="field"><label>Files (PDF or images, up to 8MB each, multiple allowed)</label><input id="gF" type="file" accept="application/pdf,image/*" multiple/></div>'+
        (encOn?'<p class="muted" style="font-size:12.5px;margin:-4px 0 10px">'+I('shield')+' Files are end-to-end encrypted before upload. Only you can open them.</p>':'')+
        '<div id="gProg" class="muted" style="font-size:13px"></div>'+
        '<button class="btn btn-primary btn-block" id="gS" style="margin-top:8px">'+I('upload')+' Upload</button>',function(root){
        $('#gS',root).onclick=function(){
          var ven=$('#gV',root).value;if(!ven){toast('Add a vendor first','err');return;}
          var files=Array.prototype.slice.call($('#gF',root).files);if(!files.length){toast('Choose file(s)');return;}
          var tooBig=files.filter(function(f){return f.size>8*1024*1024;});if(tooBig.length){toast('Some files exceed 8MB','err');return;}
          var btn=$('#gS',root);btn.disabled=true;var done=0;
          (function next(i){
            if(i>=files.length){closeSheet();toast('Uploaded '+done+' file'+(done===1?'':'s'),'ok');go('gst');return;}
            var f=files[i];$('#gProg',root).textContent=(encOn?'Encrypting & uploading ':'Uploading ')+(i+1)+' of '+files.length+': '+f.name;
            var reader=new FileReader();
            reader.onload=function(){
              var raw=new Uint8Array(reader.result);
              var send=function(bytes){var b64=b64enc(bytes);
                api('uploadGstInvoice',{projectId:S.projectId,vendorId:ven,fileName:f.name,mimeType:f.type||'application/octet-stream',fileBase64:b64,encrypted:encOn?1:0,date:todayStr()})
                  .then(function(){done++;next(i+1);}).catch(function(e){toast(f.name+': '+errMsg(e),'err');next(i+1);});};
              if(encOn)encEncrypt(ENC.key,raw).then(send).catch(function(){toast('Encryption failed for '+f.name,'err');next(i+1);});
              else send(raw);
            };
            reader.readAsArrayBuffer(f);
          })(0);
        };
      });
    });
    });
  }
  function openGstFile(id,save){
    toast('Opening...');
    api('getGstFile',{id:id}).then(function(d){
      var bytes=b64dec(d.base64);
      var show=function(plain){var blob=new Blob([plain],{type:d.mimeType});if(save){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=d.fileName||'file';document.body.appendChild(a);a.click();a.remove();}else{var url=URL.createObjectURL(blob);window.open(url,'_blank');setTimeout(function(){URL.revokeObjectURL(url);},60000);}};
      if(d.encrypted){encEnsure().then(function(key){if(!key){toast('Unlock required to open this file','err');return;}encDecrypt(ENC.key,bytes).then(function(pt){show(new Uint8Array(pt));}).catch(function(){toast('Could not decrypt. Wrong passphrase?','err');});});}
      else show(bytes);
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function viewGstFile(id){openGstFile(id,false);}

  /* ======================= LOANS & DEBTS ======================= */
  function viewLoans(v,mySeq){
    v.innerHTML=pageHead('Loans & Debts',curProject().name||'','<button class="btn btn-primary btn-sm" id="addL">'+I('plus')+' New loan</button>')+
      '<div class="kpis" id="loanKpis"></div>'+
      '<div class="card"><div id="loanList"><div class="skeleton" style="height:120px"></div></div></div>';
    $('#addL').onclick=function(){openLoanSheet();};
    api('listLoans',{projectId:S.projectId}).then(function(d){if(!alive(mySeq))return;var loans=d.loans||[];
      var active=loans.filter(function(l){return l.status!=='closed';});
      var out=active.reduce(function(s,l){return s+(Number(l.outstanding)||0);},0);
      var emi=active.reduce(function(s,l){return s+(Number(l.emi)||0);},0);
      var k=$('#loanKpis');if(k)k.innerHTML=aKpi('Total outstanding',money(out),'neg')+aKpi('Monthly EMI',money(emi),'');
      var el=$('#loanList');if(!el)return;
      el.innerHTML=loans.length?loans.map(function(l){return '<div class="item" data-lid="'+l.id+'"><div class="av">'+I('wallet')+'</div><div class="meta"><div class="t">'+esc(l.lender)+' <span class="muted" style="font-weight:400">· '+esc(l.type||'')+'</span>'+(l.status==='closed'?' <span class="st-badge st-active">closed</span>':'')+'</div><div class="s">'+(Number(l.interestRate)>0?esc(l.interestRate+'% '+(l.rateType||''))+' · ':'')+(Number(l.emi)>0?'EMI '+money(l.emi):'')+'</div></div><div class="amt neg">'+money(l.outstanding)+'</div></div>';}).join(''):'<div class="empty"><div class="ei">'+I('wallet')+'</div><h3>No loans or debts</h3><p>Track loans, their EMIs and what is still outstanding.</p></div>';
      $all('.item[data-lid]',el).forEach(function(it){it.onclick=function(){openLoanSheet(loans.filter(function(x){return x.id===it.getAttribute('data-lid');})[0]);};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openLoanSheet(l){
    var e=l||{};
    openSheet(l?'Edit loan':'New loan',
      '<div class="field"><label>Lender</label><input id="lL" value="'+esc(e.lender||'')+'" placeholder="Bank or person"/></div>'+
      '<div class="row2"><div class="field"><label>Type</label><input id="lTy" value="'+esc(e.type||'')+'" placeholder="Term loan"/></div>'+
      '<div class="field"><label>Status</label><select id="lSt"><option value="active"'+(e.status!=='closed'?' selected':'')+'>Active</option><option value="closed"'+(e.status==='closed'?' selected':'')+'>Closed</option></select></div></div>'+
      '<div class="row2"><div class="field"><label>Principal</label><input id="lP" type="number" value="'+(e.principal||'')+'"/></div>'+
      '<div class="field"><label>Outstanding</label><input id="lO" type="number" value="'+(e.outstanding!=null?e.outstanding:'')+'"/></div></div>'+
      '<div class="row2"><div class="field"><label>Interest %</label><input id="lR" type="number" value="'+(e.interestRate||'')+'"/></div>'+
      '<div class="field"><label>Rate type</label><select id="lRT"><option value="reducing"'+(e.rateType!=='flat'?' selected':'')+'>Reducing</option><option value="flat"'+(e.rateType==='flat'?' selected':'')+'>Flat</option></select></div></div>'+
      '<div class="row2"><div class="field"><label>EMI</label><input id="lE" type="number" value="'+(e.emi||'')+'"/></div>'+
      '<div class="field"><label>Tenure (months)</label><input id="lT" type="number" value="'+(e.tenureMonths||'')+'"/></div></div>'+
      '<div class="field"><label>Start date</label><input id="lD" type="date" value="'+esc(e.startDate||todayStr())+'"/></div>'+
      '<div class="field"><label>Note</label><input id="lN" value="'+esc(e.note||'')+'"/></div>'+
      '<button class="btn btn-primary btn-block" id="lS">'+(l?'Save loan':'Add loan')+'</button>'+
      (l?'<button class="btn btn-logout btn-block" id="lDel" style="margin-top:10px">'+I('trash')+' Delete</button>':''),
      function(root){
        $('#lS',root).onclick=function(){var lender=$('#lL',root).value.trim();if(!lender){toast('Enter the lender','err');return;}
          var payload={projectId:S.projectId,lender:lender,type:$('#lTy',root).value.trim(),status:$('#lSt',root).value,principal:Number($('#lP',root).value)||0,outstanding:Number($('#lO',root).value)||0,interestRate:Number($('#lR',root).value)||0,rateType:$('#lRT',root).value,emi:Number($('#lE',root).value)||0,tenureMonths:Number($('#lT',root).value)||0,startDate:$('#lD',root).value,note:$('#lN',root).value.trim()};
          var req=l?api('updateLoan',Object.assign({id:l.id},payload)):api('createLoan',payload);
          req.then(function(){closeSheet();toast('Saved','ok');go('loans');}).catch(function(e2){toast(errMsg(e2),'err');});};
        if(l)$('#lDel',root).onclick=function(){confirmSheet('Delete this loan?',function(){api('deleteLoan',{id:l.id}).then(function(){closeSheet();toast('Deleted','ok');go('loans');}).catch(function(e2){toast(errMsg(e2),'err');});});};
      });
  }
  // Booking payment schedule (installments)
  function openInstallments(bk){
    openSheet('Payment schedule','<div id="instBody"><div class="skeleton" style="height:100px"></div></div>',function(root){
      function render(){
        api('listInstallments',{bookingId:bk.id}).then(function(d){var ins=d.installments||[];
          var paid=ins.filter(function(x){return x.status==='paid';}).reduce(function(s,x){return s+(Number(x.amount)||0);},0);
          var due=ins.filter(function(x){return x.status!=='paid';}).reduce(function(s,x){return s+(Number(x.amount)||0);},0);
          var head='<p class="muted" style="margin:0 0 12px;font-size:13px">'+esc(bk.customerName||'')+' · Paid '+money(paid)+' · Due '+money(due)+'</p>';
          var rows=ins.length?ins.map(function(x){return '<div class="item" style="cursor:default"><div class="meta"><div class="t">'+money(x.amount)+' <span class="st-badge st-'+(x.status==='paid'?'active':'pending')+'">'+esc(x.status)+'</span></div><div class="s">Due '+fmtDate(x.dueDate)+(x.paidDate?' · Paid '+fmtDate(x.paidDate):'')+'</div></div>'+(x.status==='paid'?'':'<button class="btn btn-sm btn-primary" data-pay="'+x.id+'">Mark paid</button>')+'<button class="btn-icon btn-sm" data-insdel="'+x.id+'" style="margin-left:6px">'+I('trash')+'</button></div>';}).join(''):'<p class="muted" style="font-size:13px">No installments yet.</p>';
          var add='<div class="row2" style="margin-top:12px"><div class="field"><label>Amount</label><input id="inA" type="number"/></div><div class="field"><label>Due date</label><input id="inD" type="date" value="'+todayStr()+'"/></div></div><button class="btn btn-ghost btn-sm" id="inAdd">'+I('plus')+' Add installment</button>';
          $('#instBody',root).innerHTML=head+rows+add;
          $('#inAdd',root).onclick=function(){var a=Number($('#inA',root).value)||0;if(!(a>0)){toast('Enter an amount','err');return;}api('createInstallment',{bookingId:bk.id,amount:a,dueDate:$('#inD',root).value}).then(render).catch(function(e){toast(errMsg(e),'err');});};
          $all('[data-pay]',root).forEach(function(b){b.onclick=function(){api('updateInstallment',{id:b.getAttribute('data-pay'),status:'paid',paidDate:todayStr()}).then(render).catch(function(e){toast(errMsg(e),'err');});};});
          $all('[data-insdel]',root).forEach(function(b){b.onclick=function(){api('deleteInstallment',{id:b.getAttribute('data-insdel')}).then(render).catch(function(e){toast(errMsg(e),'err');});};});
        }).catch(function(e){$('#instBody',root).innerHTML='<p class="muted">'+esc(errMsg(e))+'</p>';});
      }
      render();
    });
  }

  /* ======================= SETTINGS (no backend URL) ======================= */
  function viewSettings(v){
    var p=curProject();
    v.innerHTML=pageHead('Settings',p.name||'')+
      '<div class="card plan-card"><div class="card-h"><h3>Plan</h3><span class="st-badge st-'+(isPro()?'active':isReadOnly()?'suspended':'pending')+'">'+(isPro()?'Pro':isReadOnly()?'Lapsed':'Free')+'</span></div>'+
        '<p class="muted" style="font-size:13px;margin:-4px 0 12px">'+(isPro()?'You have full access'+(S.user&&S.user.planUntil?' · renews '+fmtDate(S.user.planUntil):'')+'.':isReadOnly()?'Read-only. Renew Pro to make changes.':'Free plan. Upgrade to unlock unlimited voice, invoice emails, exports and more.')+'</p>'+
        '<button class="btn '+(isPro()?'btn-ghost':'btn-primary')+' btn-sm" id="planBtn">'+I('shield')+' '+(isPro()?'Manage plan':'Upgrade to Pro')+'</button></div>'+
      '<div class="card"><div class="card-h"><h3>Appearance</h3></div>'+
        '<div class="seg theme-seg" id="themeSeg"><button data-t="light">Light</button><button data-t="dark">Dark</button></div></div>'+
      '<div class="card"><div class="card-h"><h3>'+pw1()+'</h3><button class="btn btn-ghost btn-sm" id="newProj">'+I('plus')+' New</button></div>'+
        (S.projectId?'<div class="field"><label>Name</label><input id="pName" value="'+esc(p.name||'')+'"/></div>'+
        '<div class="row2"><div class="field"><label>'+cw()+' (one-time)</label><input id="pLand" type="number" value="'+(p.landCost||0)+'"/></div>'+
        '<div class="field"><label>Currency</label><select id="pCur">'+Object.keys(CURRENCIES).map(function(c){return '<option value="'+c+'"'+((p.currency||'INR')===c?' selected':'')+'>'+c+' '+CURRENCIES[c].trim()+'</option>';}).join('')+'</select></div></div>'+
        '<button class="btn btn-primary" id="pSave">'+I('check')+' Save '+pw1().toLowerCase()+'</button>'+
        '<button class="btn btn-logout" id="pDel" style="margin-left:8px">'+I('trash')+' Delete '+pw1().toLowerCase()+'</button>':'<p class="muted">Create a '+pw1().toLowerCase()+' to begin.</p>')+'</div>'+
      '<div class="card"><div class="card-h"><h3>Business details</h3><span class="sub">for invoices</span></div>'+
        '<p class="muted" id="bizStat" style="font-size:13px;margin:-6px 0 12px">Set your business name, address and GST so invoices look professional.</p>'+
        '<button class="btn btn-ghost btn-sm" id="editBiz">'+I('building')+' Edit business details</button></div>'+
      '<div class="card"><div class="card-h"><h3>Privacy &amp; encryption</h3><span class="sub">for your files</span></div>'+
        '<p class="muted" id="encStat" style="font-size:13px;margin:-6px 0 12px">End-to-end encrypt the documents you upload. Only you can open them, with a passphrase we never see.</p>'+
        '<button class="btn btn-ghost btn-sm" id="encBtn">'+I('shield')+' Set up file encryption</button>'+
        '<div style="height:12px"></div><p class="muted" id="lockStat" style="font-size:13px;margin:0 0 12px">App lock asks for a PIN each time this device opens the app.</p>'+
        '<button class="btn btn-ghost btn-sm" id="lockBtn">'+I('lock')+' App lock</button>'+
        '<label class="switch-row" style="margin-top:14px"><input type="checkbox" id="loginAlert"/> <span>Email me when my account signs in</span></label></div>'+
      '<div class="card"><div class="card-h"><h3>Categories</h3><span class="sub">Add or remove your own types</span></div>'+
        '<div class="row2"><button class="btn btn-ghost btn-sm" data-mng="VENDOR_TYPE">'+I('cube')+' Vendor types</button><button class="btn btn-ghost btn-sm" data-mng="SALARY_ROLE">'+I('hardhat')+' Salary roles</button></div>'+
        '<div class="row2" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-mng="INVENTORY_TYPE">'+I('home')+' Unit types</button><button class="btn btn-ghost btn-sm" data-mng="MISC_TYPE">'+I('box')+' Expense types</button></div></div>'+
      '<div class="card"><div class="card-h"><h3>Recurring entries</h3><span class="sub">auto-posted</span></div>'+
        '<p class="muted" style="font-size:13px;margin:-6px 0 12px">Set rent, salaries or EMIs once and they post automatically on schedule.</p>'+
        '<button class="btn btn-ghost btn-sm" id="mngRecur">'+I('ledger')+' Manage recurring</button></div>'+
      '<div class="card"><div class="card-h"><h3>Budgets &amp; alerts</h3><span class="sub">monthly</span></div>'+
        '<p class="muted" style="font-size:13px;margin:-6px 0 12px">Set a monthly spending limit per category. The dashboard flags categories that go over.</p>'+
        '<button class="btn btn-ghost btn-sm" id="budgetBtn">'+I('wallet')+' Set budgets</button></div>'+
      '<div class="card"><div class="card-h"><h3>Your data</h3></div>'+
        '<p class="muted" style="font-size:13px;margin:-6px 0 12px">Download your transactions as a spreadsheet (CSV).</p>'+
        '<button class="btn btn-ghost btn-sm" id="csvBtn">'+I('download')+' Export transactions (CSV)</button></div>'+
      '<div class="card"><div class="card-h"><h3>Voice language</h3><span class="sub">for speaking entries</span></div>'+
        '<div class="field"><label>Recognise my voice in</label><select id="langSel">'+
        [['en-IN','English (India)'],['hi-IN','Hindi'],['mr-IN','Marathi'],['gu-IN','Gujarati'],['bn-IN','Bengali'],['ta-IN','Tamil'],['te-IN','Telugu'],['kn-IN','Kannada'],['pa-IN','Punjabi'],['en-US','English (US)']]
          .map(function(l){var cur='en-IN';try{cur=localStorage.getItem('bk_lang')||'en-IN';}catch(e){}return '<option value="'+l[0]+'"'+(cur===l[0]?' selected':'')+'>'+l[1]+'</option>';}).join('')+
        '</select></div><p class="muted" style="font-size:12.5px;margin-top:-4px">Speak in this language. The AI also understands mixed language (for example Hinglish).</p></div>'+
      '<div class="card"><div class="card-h"><h3>Daily email report</h3></div>'+
        (S.features.email?'':'<p class="muted" style="font-size:13px;margin-top:-8px">Add a Resend key on the server to enable email.</p>')+
        '<div class="field"><label>Send to</label><input id="rEmail" type="email" value="'+esc(S.user?S.user.email:'')+'"/></div>'+
        '<div class="row2"><div class="field"><label>Hour (0-23)</label><input id="rHour" type="number" min="0" max="23" value="20"/></div>'+
        '<div class="field" style="display:flex;align-items:flex-end"><button class="btn btn-primary btn-block" id="rEnable"'+(S.features.email?'':' disabled')+'>Enable</button></div></div></div>'+
      '<div class="card" id="acctCard"><div class="card-h"><h3>Account</h3><span class="sub">your profile</span></div>'+
        '<div class="field"><label>Name</label><input id="acName" autocomplete="name" value="'+esc(S.user&&S.user.name||'')+'"/></div>'+
        '<div class="field"><label>Email</label><input value="'+esc(S.user?S.user.email:'')+'" disabled/><span class="field-hint">Your email cannot be changed.</span></div>'+
        '<div class="field"><label>WhatsApp number</label><input id="acWa" type="tel" inputmode="tel" placeholder="+91 98765 43210" value="'+esc(S.user&&S.user.whatsapp||'')+'"/><span class="field-hint">With country code. Used to send invoices and reports on WhatsApp.</span></div>'+
        '<div class="field"><label>Language</label><select id="acLang">'+Object.keys(LANGS).map(function(l){return '<option value="'+l+'"'+(uiLang()===l?' selected':'')+'>'+LANGS[l]+'</option>';}).join('')+'</select><span class="field-hint">Changes the whole app and your voice entry language.</span></div>'+
        '<button class="btn btn-primary" id="acSave">Save profile</button>'+
        '<div class="card-h" style="margin-top:18px"><h3>Change password</h3></div>'+
        '<div class="field"><label>Current password</label><div class="pass-wrap"><input id="acCur" type="password" autocomplete="current-password"/><button type="button" class="pass-eye" id="acCurEye">'+I('eye')+'</button></div></div>'+
        '<div class="field"><label>New password</label><div class="pass-wrap"><input id="acNew" type="password" autocomplete="new-password" placeholder="At least 8 characters"/><button type="button" class="pass-eye" id="acNewEye">'+I('eye')+'</button></div><span class="field-hint">Use at least 8 characters with a letter and a number.</span></div>'+
        '<div class="field"><label>Confirm new password</label><div class="pass-wrap"><input id="acNew2" type="password" autocomplete="new-password"/><button type="button" class="pass-eye" id="acNew2Eye">'+I('eye')+'</button></div></div>'+
        '<button class="btn btn-ghost" id="acPwSave">Update password</button>'+
        '<hr style="border:none;border-top:1px solid var(--line);margin:18px 0"/>'+
        '<p class="muted" style="font-size:13.5px;margin-top:0">Signed in as <b>'+esc(S.user?S.user.email:'')+'</b></p>'+
        '<button class="btn btn-logout" id="lo">'+I('logout')+' Log out</button></div>';
    if(S.projectId)$('#pSave').onclick=function(){api('updateProject',{id:S.projectId,name:$('#pName').value.trim(),landCost:Number($('#pLand').value)||0,currency:$('#pCur')?$('#pCur').value:'INR'}).then(function(d){S.projects=S.projects.map(function(x){return x.id===d.project.id?d.project:x;});toast('Saved','ok');syncProjSel();}).catch(function(e){toast(errMsg(e),'err');});};
    if(S.projectId)$('#pDel').onclick=function(){var pid=S.projectId,nm=curProject().name||pw1();
      securePrompt('Delete "'+nm+'" and ALL its data (transactions, bookings, invoices, GST files, loans)? This cannot be undone. Enter your password to confirm.',function(pw){
        return api('deleteProject',{id:pid,password:pw}).then(function(){S.projects=S.projects.filter(function(x){return x.id!==pid;});S.projectId=null;try{localStorage.removeItem('bk_proj');}catch(e){}invalidateTx();var act=S.projects.filter(function(x){return x.status!=='archived';});if(act[0])setProjId(act[0].id);toast('Deleted','ok');go(S.projectId?'settings':'dashboard');});
      });};
    $('#newProj').onclick=openProjectSheet;
    (function(){var seg=$('#themeSeg');function paint(){$all('button',seg).forEach(function(b){b.classList.toggle('on',b.getAttribute('data-t')===getTheme());});}paint();seg.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;applyTheme(b.getAttribute('data-t'));paint();});})();
    $('#langSel').onchange=function(){try{localStorage.setItem('bk_lang',this.value);}catch(e){}toast('Voice language set','ok');};
    $all('[data-mng]').forEach(function(b){b.onclick=function(){openManageLookups(b.getAttribute('data-mng'));};});
    $('#mngRecur').onclick=function(){openRecurringManage();};
    $('#csvBtn').onclick=function(){exportTxCsv();};
    $('#budgetBtn').onclick=function(){openBudgetsSheet();};
    $('#planBtn').onclick=function(){openUpgrade();};
    $('#editBiz').onclick=function(){openBusinessSheet();};
    loadBusiness().then(function(b){var st=$('#bizStat');if(st)st.textContent=bizReady(b)?('Set: '+b.name+(b.gstEnabled?' · GST '+b.gstin:' · no GST')):'Not set yet. Add your business name and address to generate invoices.';});
    $('#encBtn').onclick=function(){openEncryptionSheet();};
    (function(){var ls=$('#lockStat'),lb=$('#lockBtn');if(ls)ls.textContent=getLock()?'App lock is ON. A PIN is required each time this device opens the app.':'App lock asks for a PIN each time this device opens the app. Currently off.';if(lb)lb.innerHTML=I('lock')+(getLock()?' Change or turn off PIN':' Set a PIN');})();
    $('#lockBtn').onclick=function(){openAppLockSheet();};
    api('getSettings',{}).then(function(d){var la=$('#loginAlert');if(la&&d.settings)la.checked=d.settings.loginAlerts==='true';}).catch(function(){});
    $('#loginAlert').onchange=function(){api('setSetting',{key:'loginAlerts',value:this.checked?'true':'false'}).then(function(){toast('Saved','ok');}).catch(function(e){toast(errMsg(e),'err');});};
    encLoadMeta().then(function(){var st=$('#encStat'),bt=$('#encBtn');if(!st)return;
      if(ENC.enabled){st.textContent=encUnlocked()?'On. Your uploaded files are end-to-end encrypted and unlocked for this session.':'On. Your uploaded files are end-to-end encrypted. Unlock with your passphrase to open them.';if(bt)bt.innerHTML=I('shield')+(encUnlocked()?' Encryption on':' Unlock / manage');}
      else{st.textContent='Off. Turn it on to end-to-end encrypt the documents you upload.';}});
    $('#rEnable').onclick=function(){api('configureDailyReport',{enabled:true,email:$('#rEmail').value.trim(),hour:Number($('#rHour').value)}).then(function(){toast('Daily report enabled','ok');}).catch(function(e){toast(errMsg(e),'err');});};
    bindEye('acCurEye','acCur');bindEye('acNewEye','acNew');bindEye('acNew2Eye','acNew2');
    $('#acLang').onchange=function(){setLang(this.value,true);};
    $('#acSave').onclick=function(){var wa=$('#acWa').value.trim();if(wa&&!waValid(wa)){toast('Enter a valid WhatsApp number with country code','err');return;}
      api('updateMe',{name:$('#acName').value.trim(),whatsapp:wa}).then(function(d){S.user.name=d.user.name;S.user.whatsapp=d.user.whatsapp;toast('Profile saved','ok');}).catch(function(e){toast(errMsg(e),'err');});};
    $('#acPwSave').onclick=function(){var cur=$('#acCur').value,nw=$('#acNew').value,nw2=$('#acNew2').value;
      if(!cur){toast('Enter your current password','err');return;}
      var perr=pwError(nw);if(perr){toast(perr,'err');return;}
      if(nw!==nw2){toast('New passwords do not match','err');return;}
      api('updateMe',{currentPassword:cur,newPassword:nw}).then(function(){$('#acCur').value='';$('#acNew').value='';$('#acNew2').value='';toast('Password updated','ok');}).catch(function(e){toast(errMsg(e),'err');});};
    $('#lo').onclick=logout;
  }
  function openProjectSheet(firstTime){
    var intro=firstTime?'<p class="muted" style="margin:-6px 0 14px">Welcome. Create your first '+pw1().toLowerCase()+' to start. You can add more any time from the dropdown at the top.</p>':'';
    openSheet(firstTime?'Create your first '+pw1():'New '+pw1(),intro+'<div class="field"><label>'+pw1()+' name</label><input id="npN" placeholder="'+esc(pw1())+' name"/></div><div class="field"><label>'+cw()+' (optional)</label><input id="npL" type="number"/></div><button class="btn btn-primary btn-block" id="npS">Create '+pw1()+'</button>',function(root){
      $('#npS',root).onclick=function(){var n=$('#npN',root).value.trim();if(!n){toast('Enter a name');return;}
        api('createProject',{name:n,landCost:Number($('#npL',root).value)||0}).then(function(d){S.projects.push(d.project);setProjId(d.project.id);invalidateTx();closeSheet();toast('Created','ok');loadLookups().then(function(){go('dashboard');});}).catch(function(e){toast(errMsg(e),'err');});};
    });
  }
  function openBusinessSheet(){
    loadBusiness().then(function(b){b=b||{};
      openSheet('Business details',
        '<p class="muted" style="margin:0 0 12px;font-size:13px">These appear on your invoices. Add a logo and signature for a professional look.</p>'+
        '<div class="field"><label>Business name</label><input id="bzName" value="'+esc(b.name||'')+'" placeholder="Your business name"/></div>'+
        '<div class="field"><label>Address</label><textarea id="bzAddr" rows="2" placeholder="Full address">'+esc(b.address||'')+'</textarea></div>'+
        '<div class="row2"><div class="field"><label>Phone</label><input id="bzPhone" value="'+esc(b.phone||'')+'" placeholder="+91 ..."/></div>'+
        '<div class="field"><label>Email</label><input id="bzEmail" type="email" value="'+esc(b.email||'')+'"/></div></div>'+
        '<label class="switch-row"><input type="checkbox" id="bzGst" '+(b.gstEnabled?'checked':'')+'/> <span>My invoices include GST</span></label>'+
        '<div class="row2" id="bzGstWrap" style="margin-top:10px;'+(b.gstEnabled?'':'display:none')+'"><div class="field"><label>GSTIN</label><input id="bzGstin" value="'+esc(b.gstin||'')+'" placeholder="22AAAAA0000A1Z5"/></div>'+
        '<div class="field"><label>GST rate (%)</label><input id="bzRate" type="number" value="'+(b.gstRate||18)+'"/></div></div>'+
        '<div class="row2"><div class="field"><label>Logo</label><input id="bzLogo" type="file" accept="image/png,image/jpeg"/><div class="biz-prev" id="bzLogoPrev">'+(b.logo?'<img src="'+b.logo+'"/>':'')+'</div></div>'+
        '<div class="field"><label>Signature</label><input id="bzSign" type="file" accept="image/png,image/jpeg"/><div class="biz-prev" id="bzSignPrev">'+(b.sign?'<img src="'+b.sign+'"/>':'')+'</div></div></div>'+
        '<button class="btn btn-primary btn-block" id="bzSave">Save business details</button>',
        function(root){
          $('#bzGst',root).onchange=function(){$('#bzGstWrap',root).style.display=this.checked?'':'none';};
          function bindImg(inputId,prevId,kind){$('#'+inputId,root).onchange=function(){var f=this.files&&this.files[0];if(!f)return;if(f.size>1200000){toast('Image too large, keep it under ~1MB','err');this.value='';return;}var rd=new FileReader();rd.onload=function(){var data=rd.result;var pv=$('#'+prevId,root);if(pv)pv.innerHTML='<img src="'+data+'"/>';api('setBrandAsset',{kind:kind,dataUrl:data}).then(function(){if(kind==='logo')S.business.logo=data;else S.business.sign=data;toast('Uploaded','ok');}).catch(function(e){toast(errMsg(e),'err');});};rd.readAsDataURL(f);};}
          bindImg('bzLogo','bzLogoPrev','logo');bindImg('bzSign','bzSignPrev','sign');
          $('#bzSave',root).onclick=function(){var btn=$('#bzSave',root);btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
            api('setBusiness',{name:$('#bzName',root).value.trim(),address:$('#bzAddr',root).value.trim(),gstin:$('#bzGstin',root)?$('#bzGstin',root).value.trim():'',phone:$('#bzPhone',root).value.trim(),email:$('#bzEmail',root).value.trim(),gstEnabled:$('#bzGst',root).checked,gstRate:Number($('#bzRate',root)?$('#bzRate',root).value:18)||18})
            .then(function(){return loadBusiness(true);}).then(function(){closeSheet();toast('Saved','ok');if(S.route==='settings')go('settings');}).catch(function(e){btn.disabled=false;btn.innerHTML='Save business details';toast(errMsg(e),'err');});};
        });
    });
  }

  // Budgets stored per user in settings (JSON of {CATEGORY: monthlyLimit}).
  var BUDGET_CATS=['VENDOR','SALARY','MISC','CHALLAN'];
  function loadBudgets(force){
    if(!force&&S.budgets)return Promise.resolve(S.budgets);
    return api('getSettings',{}).then(function(d){var raw=(d.settings&&d.settings.budgets)||'';try{S.budgets=raw?JSON.parse(raw):{};}catch(e){S.budgets={};}return S.budgets;}).catch(function(){S.budgets={};return S.budgets;});
  }
  function openBudgetsSheet(){
    loadBudgets().then(function(b){b=b||{};
      openSheet('Monthly budgets','<p class="muted" style="margin:0 0 12px;font-size:13px">Leave blank for no limit. Amounts are per month.</p>'+
        BUDGET_CATS.map(function(c){return '<div class="field"><label>'+(CAT[c]?CAT[c].label:c)+'</label><input id="bud_'+c+'" type="number" value="'+(b[c]||'')+'" placeholder="No limit"/></div>';}).join('')+
        '<button class="btn btn-primary btn-block" id="budSave">Save budgets</button>',function(root){
        $('#budSave',root).onclick=function(){var out={};BUDGET_CATS.forEach(function(c){var val=Number($('#bud_'+c,root).value)||0;if(val>0)out[c]=val;});
          api('setSetting',{key:'budgets',value:JSON.stringify(out)}).then(function(){S.budgets=out;closeSheet();toast('Budgets saved','ok');}).catch(function(e){toast(errMsg(e),'err');});};
      });
    });
  }
  function renderBudgets(){
    var box=$('#budgetBox');if(!box)return;
    loadBudgets().then(function(b){b=b||{};var keys=Object.keys(b);if(!keys.length){box.innerHTML='';return;}
      var now=new Date(),mk=now.getFullYear()+'-'+p2(now.getMonth()+1);var spent={};
      (S.tx||[]).forEach(function(t){if(t.type==='EXPENSE'&&monthKey(t.date)===mk)spent[t.category]=(spent[t.category]||0)+(Number(t.amount)||0);});
      box.innerHTML='<div class="card"><div class="card-h"><h3>Budgets this month</h3></div>'+keys.map(function(c){var lim=b[c],sp=spent[c]||0,pct=Math.min(100,Math.round(sp/lim*100)),over=sp>lim;
        return '<div class="bud-row"><div class="bud-top"><span>'+esc(CAT[c]?CAT[c].label:c)+'</span><span'+(over?' class="cmp-down"':'')+'>'+money(sp)+' / '+money(lim)+(over?' · over':'')+'</span></div><div class="ai-bar"><span style="width:'+pct+'%'+(over?';background:var(--neg)':'')+'"></span></div></div>';
      }).join('')+'</div>';
    });
  }
  function exportTxCsv(){
    if(!isPro()){needPro('export');return;}
    if(!S.projectId){toast('Open a '+pw1().toLowerCase()+' first');return;}
    loadTx().then(function(tx){tx=tx||[];
      var rows=[['Date','Type','Category','Sub-category','Note','Amount']];
      tx.slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date));}).forEach(function(t){rows.push([t.date||'',t.type||'',t.category||'',t.subCategory||'',(t.vendorName||t.note||''),Math.round(Number(t.amount)||0)]);});
      var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
      var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(curProject().name||'transactions').replace(/[^\w-]+/g,'_')+'.csv';document.body.appendChild(a);a.click();a.remove();toast('Exported','ok');
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openAppLockSheet(){
    var has=!!getLock();
    openSheet('App lock','<p class="muted" style="margin:0 0 12px;font-size:13.5px">'+(has?'App lock is on for this device.':'Set a 4 to 8 digit PIN. It is stored only on this device (hashed), never on our servers.')+'</p>'+
      '<div class="field"><label>'+(has?'New PIN':'PIN')+'</label><input id="lkP1" type="password" inputmode="numeric" maxlength="8" placeholder="PIN"/></div>'+
      '<div class="field"><label>Confirm PIN</label><input id="lkP2" type="password" inputmode="numeric" maxlength="8" placeholder="Re-enter PIN"/></div>'+
      '<button class="btn btn-primary btn-block" id="lkSet">'+(has?'Update PIN':'Turn on app lock')+'</button>'+
      (has?'<button class="btn btn-logout btn-block" id="lkOff" style="margin-top:10px">'+I('lock')+' Turn off app lock</button>':''),function(root){
      $('#lkSet',root).onclick=function(){var p1=$('#lkP1',root).value,p2=$('#lkP2',root).value;if(!/^\d{4,8}$/.test(p1)){toast('Use a 4 to 8 digit PIN','err');return;}if(p1!==p2){toast('PINs do not match','err');return;}
        var salt=buf2hex(crypto.getRandomValues(new Uint8Array(8)));pinHash(p1,salt).then(function(hsh){try{localStorage.setItem('bk_lock',JSON.stringify({hash:hsh,salt:salt}));sessionStorage.setItem('bk_unlocked','1');}catch(e){}closeSheet();toast('App lock on','ok');if(S.route==='settings')go('settings');});};
      if(has)$('#lkOff',root).onclick=function(){confirmSheet('Turn off app lock on this device?',function(){try{localStorage.removeItem('bk_lock');}catch(e){}closeSheet();toast('App lock off','ok');if(S.route==='settings')go('settings');});};
    });
  }
  /* ---- billing / upgrade ---- */
  function featureMsg(f){return {invoiceEmail:'Emailing invoices is a Pro feature.',export:'Exporting data and reports is a Pro feature.',category:'Custom categories are a Pro feature.',history:'Seeing your full transaction history is a Pro feature.',mic:'More daily voice entries is a Pro feature.',filters:'More filters are a Pro feature.',readonly:'Your Pro plan has lapsed. Renew to make changes.'}[f]||'Unlock everything with Vozimi Pro.';}
  function openUpgrade(feature){
    openSheet('Vozimi Pro','<div id="upBody"><div class="skeleton" style="height:140px"></div></div>',function(root){
      api('billingInfo',{}).then(function(b){
        var feats='<ul class="up-list"><li>Unlimited voice entries, no daily cap</li><li>Email invoices straight to customers</li><li>Full transaction history + CSV/PDF export</li><li>Custom categories and all filters</li><li>Priority support</li></ul>';
        var cur=b.plan==='pro'?'<p class="up-cur">You are on <b>Pro</b>'+(b.planUntil?' · renews '+fmtDate(b.planUntil):'')+'.</p>':(b.plan==='expired'?'<p class="up-cur" style="color:var(--neg)">Your Pro plan has lapsed, you are in read-only mode.</p>':'<p class="up-cur">You are on the <b>Free</b> plan.</p>');
        var why=feature?'<div class="up-why">'+I('shield')+' <span>'+esc(featureMsg(feature))+'</span></div>':'';
        var cta='';
        if(b.plan==='pro'){cta='<button class="btn btn-logout btn-block" id="upCancel" style="margin-top:14px">Cancel subscription</button>';}
        else if(!b.configured){cta='<div class="up-why" style="margin-top:14px">Payments are being set up, Pro will be available very soon.</div>';}
        else{cta='<div class="row2" style="margin-top:14px"><button class="btn btn-primary" id="upMon">'+(b.prices.monthly?curSym()+b.prices.monthly+' / mo':'Monthly')+'</button><button class="btn btn-primary" id="upYr">'+(b.prices.yearly?curSym()+b.prices.yearly+' / yr':'Yearly')+'</button></div><p class="muted" style="font-size:12px;margin-top:8px;text-align:center">Secure checkout by Razorpay. Cancel anytime.</p>';}
        $('#upBody',root).innerHTML=why+cur+feats+cta;
        var mon=$('#upMon',root);if(mon)mon.onclick=function(){startCheckout('monthly',b.keyId);};
        var yr=$('#upYr',root);if(yr)yr.onclick=function(){startCheckout('yearly',b.keyId);};
        var cc=$('#upCancel',root);if(cc)cc.onclick=function(){confirmSheet('Cancel Pro at the end of this billing cycle?',function(){api('cancelSubscription',{}).then(function(){toast('Pro will cancel at cycle end','ok');closeSheet();}).catch(function(e){toast(errMsg(e),'err');});});};
      }).catch(function(e){$('#upBody',root).innerHTML='<p class="muted">'+esc(errMsg(e))+'</p>';});
    });
  }
  function startCheckout(interval,keyId){
    if(!window.Razorpay){toast('Checkout is still loading, try again','err');return;}
    toast('Starting secure checkout...');
    api('createSubscription',{interval:interval}).then(function(d){
      var rz=new Razorpay({key:d.keyId||keyId,subscription_id:d.subscriptionId,name:'Vozimi',description:'Vozimi Pro, '+interval,theme:{color:'#0B0B0C'},prefill:{email:(S.user&&S.user.email)||''},
        handler:function(){toast('Payment received, activating Pro...','ok');var tries=0;(function poll(){api('me',{}).then(function(u){if(u.plan==='pro'||tries++>4){applyPlan(u);closeSheet();toast(u.plan==='pro'?'Welcome to Pro!':'Payment is processing, refresh in a minute.','ok');go(S.route);}else setTimeout(poll,2500);}).catch(function(){});})();},
        modal:{ondismiss:function(){}}});
      rz.open();
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function applyPlan(u){if(!S.user)return;S.user.plan=u.plan;S.user.limits=u.limits||FREE_LIMITS;S.user.readOnly=!!u.readOnly;S.user.planUntil=u.planUntil||'';}
  function openEncryptionSheet(){
    encLoadMeta().then(function(){
      if(!ENC.enabled){
        openSheet('Set up file encryption',
          '<p class="muted" style="margin:0 0 12px;font-size:13.5px">Choose a passphrase. Documents you upload will be encrypted so only you can open them. <b>We never see this passphrase and cannot reset it. If you lose it, those files cannot be recovered.</b></p>'+
          '<div class="field"><label>Passphrase</label><div class="pass-wrap"><input id="enP" type="password" placeholder="At least 8 characters"/><button type="button" class="pass-eye" id="enEye">'+I('eye')+'</button></div></div>'+
          '<div class="field"><label>Confirm passphrase</label><input id="enP2" type="password"/></div>'+
          '<label class="switch-row"><input type="checkbox" id="enAck"/> <span>I understand that if I lose this passphrase, my encrypted files cannot be recovered.</span></label>'+
          '<button class="btn btn-primary btn-block" id="enGo" style="margin-top:14px">'+I('shield')+' Turn on encryption</button>',
          function(root){ bindEye('enEye','enP');
            $('#enGo',root).onclick=function(){var p=$('#enP',root).value,p2=$('#enP2',root).value;
              if(p.length<8){toast('Use at least 8 characters','err');return;}
              if(p!==p2){toast('Passphrases do not match','err');return;}
              if(!$('#enAck',root).checked){toast('Please acknowledge the warning','err');return;}
              var b=$('#enGo',root);b.disabled=true;b.innerHTML='<span class="spin"></span>';
              encSetup(p).then(function(){closeSheet();toast('Encryption on','ok');if(S.route==='settings')go('settings');}).catch(function(e){b.disabled=false;b.innerHTML='Turn on encryption';toast(errMsg(e),'err');});};
          });
      } else if(!encUnlocked()){
        openSheet('Unlock encryption','<p class="muted" style="margin:0 0 12px;font-size:13.5px">Enter your passphrase to open your encrypted files this session.</p>'+
          '<div class="field"><div class="pass-wrap"><input id="enU" type="password" placeholder="Encryption passphrase"/><button type="button" class="pass-eye" id="enUEye">'+I('eye')+'</button></div></div>'+
          '<button class="btn btn-primary btn-block" id="enUGo">Unlock</button>',function(root){bindEye('enUEye','enU');
            $('#enUGo',root).onclick=function(){var p=$('#enU',root).value;if(!p)return;var b=$('#enUGo',root);b.disabled=true;b.innerHTML='<span class="spin"></span>';encUnlock(p).then(function(){closeSheet();toast('Unlocked','ok');if(S.route==='settings')go('settings');}).catch(function(){b.disabled=false;b.textContent='Unlock';toast('Wrong passphrase','err');});};});
      } else {
        openSheet('File encryption','<p class="muted" style="margin:0 0 14px;font-size:13.5px">'+I('shield')+' Encryption is on and unlocked. Your uploaded documents are end-to-end encrypted, only you can open them.</p>'+
          '<button class="btn btn-logout btn-block" id="enLock">'+I('lock')+' Lock now (clear key this session)</button>',function(root){
            $('#enLock',root).onclick=function(){ENC.key=null;try{sessionStorage.removeItem('bk_enc');}catch(e){}closeSheet();toast('Locked','ok');if(S.route==='settings')go('settings');};});
      }
    });
  }

  /* ======================= GLOBAL SEARCH ======================= */
  function openGlobalSearch(){
    if(!S.projectId){toast('Create a '+pw1().toLowerCase()+' first');return;}
    openSheet('Search','<div class="field"><input id="gsQ" placeholder="Search transactions, vendors, invoices, bookings" autocomplete="off"/></div><div id="gsRes"><p class="muted" style="font-size:13px">Type to search this '+esc(pw1().toLowerCase())+'.</p></div>',function(root){
      var data={tx:S.tx||[],vendors:[],invoices:[],bookings:[]};
      Promise.all([loadTx().catch(function(){return S.tx||[];}),api('listVendors',{projectId:S.projectId}).catch(function(){return{vendors:[]};}),api('listInvoices',{projectId:S.projectId}).catch(function(){return{invoices:[]};}),api('listBookings',{projectId:S.projectId}).catch(function(){return{bookings:[]};})]).then(function(r){
        data.tx=r[0]||S.tx||[];data.vendors=r[1].vendors||[];data.invoices=r[2].invoices||[];data.bookings=r[3].bookings||[];});
      var inp=$('#gsQ',root);setTimeout(function(){inp&&inp.focus();},80);
      inp.addEventListener('input',function(){var q=this.value.trim().toLowerCase();var res=$('#gsRes',root);if(!res)return;
        if(!q){res.innerHTML='<p class="muted" style="font-size:13px">Type to search.</p>';return;}
        function m(s){return String(s||'').toLowerCase().indexOf(q)>=0;}
        var tx=(data.tx||[]).filter(function(t){return m(t.vendorName)||m(t.note)||m(t.subCategory)||m(t.category)||String(Math.round(t.amount||0)).indexOf(q)>=0;}).slice(0,8);
        var vn=(data.vendors||[]).filter(function(v){return m(v.name)||m(v.vendorType);}).slice(0,6);
        var iv=(data.invoices||[]).filter(function(x){return m(x.number)||m(x.customerName);}).slice(0,6);
        var bk=(data.bookings||[]).filter(function(x){return m(x.customerName)||m(x.inventoryType);}).slice(0,6);
        function grp(title,arr,render){return arr.length?'<div class="gs-grp"><h4>'+title+'</h4>'+arr.map(render).join('')+'</div>':'';}
        var html=grp('Transactions',tx,function(t){return '<button class="gs-row" data-gt="tx" data-gid="'+t.id+'"><span>'+esc(t.vendorName||t.subCategory||prettyCat(t.category))+'<em>'+esc(t.note||'')+' · '+fmtDate(t.date)+'</em></span><b class="'+(t.type==='INCOME'?'in':'out')+'">'+(t.type==='INCOME'?'+':'-')+money(t.amount)+'</b></button>';})+
          grp('Vendors',vn,function(v){return '<button class="gs-row" data-gt="vendor" data-gid="'+v.id+'"><span>'+esc(v.name)+'<em>'+esc(v.vendorType||'')+'</em></span></button>';})+
          grp('Invoices',iv,function(x){return '<button class="gs-row" data-gt="invoice" data-gid="'+x.id+'"><span>'+esc(x.number)+'<em>'+esc(x.customerName||'')+'</em></span><b>'+money(x.total)+'</b></button>';})+
          grp('Bookings',bk,function(x){return '<button class="gs-row" data-gt="booking" data-gid="'+x.id+'"><span>'+esc(x.customerName)+'<em>'+esc(x.inventoryType||'')+'</em></span><b>'+money(x.amount)+'</b></button>';});
        res.innerHTML=html||'<p class="muted" style="font-size:13px">No matches.</p>';
        $all('.gs-row',res).forEach(function(b){b.onclick=function(){var t=b.getAttribute('data-gt'),id=b.getAttribute('data-gid');closeSheet();
          if(t==='vendor'){var v=data.vendors.filter(function(x){return x.id===id;})[0];go('vendors');if(v)setTimeout(function(){openVendorSheet(v);},120);}
          else if(t==='invoice'){var i2=data.invoices.filter(function(x){return x.id===id;})[0];go('invoices');if(i2)setTimeout(function(){openInvoiceActions(i2);},120);}
          else if(t==='booking'){var b2=data.bookings.filter(function(x){return x.id===id;})[0];go('bookings');if(b2)setTimeout(function(){openBookingSheet(b2);},120);}
          else{go('ledger');}
        };});
      });
    });
  }

  /* ======================= MORE MENU (mobile) ======================= */
  function openMoreMenu(){
    var items=[['bookings','home','Bookings'],['vendors','cube','Vendors'],['invoices','doc','Invoices'],['gst','folder','GST invoices'],['loans','wallet','Loans'],['reminders','bell','Reminders'],['settings','settings','Settings']];
    var dark=getTheme()==='dark';
    openSheet('More',
      '<div class="more-grid">'+items.map(function(it){return '<button class="more-tile" data-m="'+it[0]+'"><span class="mt-ic">'+I(it[1])+'</span><span>'+it[2]+'</span></button>';}).join('')+
      '<button class="more-tile" id="mHelp"><span class="mt-ic">'+I('help')+'</span><span>Help</span></button>'+
      '<button class="more-tile" id="mTheme"><span class="mt-ic">'+I(dark?'sun':'moon')+'</span><span>'+(dark?'Light mode':'Dark mode')+'</span></button></div>'+
      '<button class="btn btn-logout btn-block" id="mLo" style="margin-top:14px">'+I('logout')+' Log out</button>',function(root){
      $all('[data-m]',root).forEach(function(b){b.onclick=function(){closeSheet();go(b.getAttribute('data-m'));};});
      $('#mHelp',root).onclick=function(){closeSheet();openSupportSheet();};
      $('#mTheme',root).onclick=function(){toggleTheme();closeSheet();};
      $('#mLo',root).onclick=logout;
    });
  }
  function openSupportSheet(){
    openSheet('Help & Support','<p class="muted" style="margin:0 0 14px;font-size:13.5px">Have a question or found a problem? Raise a ticket and we will reply here and by email.</p>'+
      '<div class="field"><label>Subject</label><input id="spSub" placeholder="What is this about?"/></div>'+
      '<div class="field"><label>Message</label><textarea id="spMsg" rows="4" placeholder="Describe your question or issue"></textarea></div>'+
      '<button class="btn btn-primary btn-block" id="spSend">'+I('mail')+' Send to support</button>'+
      '<div id="myTk" style="margin-top:20px"></div>',function(root){
        $('#spSend',root).onclick=function(){var msg=$('#spMsg',root).value.trim();if(!msg){toast('Please add a message');return;}
          var btn=$('#spSend',root);btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
          api('support',{email:(S.user&&S.user.email)||'',subject:$('#spSub',root).value.trim(),message:msg,source:'app'})
            .then(function(){$('#spSub',root).value='';$('#spMsg',root).value='';btn.disabled=false;btn.innerHTML=I('mail')+' Send to support';toast('Sent. We will get back to you.','ok');loadMyTickets(root);})
            .catch(function(e){btn.disabled=false;btn.innerHTML=I('mail')+' Send to support';toast(e.code==='UNKNOWN_ACTION'?'Support is not enabled yet (redeploy backend).':errMsg(e),'err');});};
        loadMyTickets(root);
        // viewing Help clears unread reply notifications
        api('ticketsSeen',{}).then(function(){refreshNotif();}).catch(function(){});
      });
  }
  var myTkClosed=false;
  function loadMyTickets(root){
    var box=$('#myTk',root);if(!box)return;
    api('myTickets',{}).then(function(d){if(!box)return;var ts=d.tickets||[];
      if(!ts.length){box.innerHTML='';return;}
      var open=ts.filter(function(t){return t.status!=='closed';}),closed=ts.filter(function(t){return t.status==='closed';});
      var list=myTkClosed?closed:open;
      box.innerHTML='<div class="card-h" style="margin-bottom:10px"><h3 style="font-size:14px">Your tickets</h3><span class="seg" id="mtSeg"><button data-mt="open" class="'+(myTkClosed?'':'on')+'">Active</button><button data-mt="closed" class="'+(myTkClosed?'on':'')+'">Closed</button></span></div>'+
        (list.length?list.map(function(t){return ticketRow(t,false);}).join(''):'<p class="muted" style="font-size:13px">No '+(myTkClosed?'closed':'active')+' tickets.</p>');
      $('#mtSeg',box).addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;myTkClosed=b.getAttribute('data-mt')==='closed';loadMyTickets(root);});
      $all('[data-tk]',box).forEach(function(b){b.onclick=function(){openTicketThread(b.getAttribute('data-tk'),false);};});
    }).catch(function(){});
  }

  /* ======================= REPORT PDF / EMAIL ======================= */
  var _lastSummary=null;
  function shareReport(){
    var s=_lastSummary;if(!s){toast('Nothing to share yet');return;}
    var proj=curProject().name||'';var r=s.range||{};
    var txt=(proj?proj+' — ':'')+'Vozimi summary'+(r.from?' ('+r.from+' to '+(r.to||todayStr())+')':'')+'\n'+
      'In: '+money(s.period.income)+'\nOut: '+money(s.period.expense)+'\nNet: '+money(s.period.net)+'\nProfit (lifetime): '+money(s.totals.profit)+' ('+Math.round(s.totals.profitRatio*100)+'%)';
    if(navigator.share){navigator.share({title:'Vozimi summary',text:txt}).catch(function(){});}
    else{window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank');}
  }
  function exportReportPdf(){
    if(!isPro()){needPro('export');return;}
    if(!_lastSummary||!window.jspdf){toast('Nothing to export yet');return;}
    var s=_lastSummary,sym=curSym(),doc=new window.jspdf.jsPDF();
    doc.setFontSize(20);doc.text('Vozimi',14,20);doc.setFontSize(12);doc.setTextColor(90);
    doc.text(curProject().name+(s.range.from?'  ('+s.range.from+' to '+s.range.to+')':''),14,28);doc.setTextColor(0);var y=44;
    function line(l,val,col){doc.setFontSize(12);if(col)doc.setTextColor.apply(doc,col);doc.text(l,14,y);doc.text(sym+Math.round(val).toLocaleString('en-IN'),196,y,{align:'right'});doc.setTextColor(0);y+=10;}
    line('Income (period)',s.period.income,[31,157,107]);line('Expense (period)',s.period.expense,[220,91,87]);line('Net (period)',s.period.net);
    y+=4;doc.setFontSize(11);doc.setTextColor(120);doc.text('Expense by category',14,y);doc.setTextColor(0);y+=8;
    Object.keys(s.period.byCategory).forEach(function(k){line('  '+prettyCat(k),s.period.byCategory[k]);});
    y+=4;doc.line(14,y,196,y);y+=10;line(cw(),s.totals.landCost);
    doc.setFont(undefined,'bold');line('Profit (lifetime)  '+Math.round(s.totals.profitRatio*100)+'%',s.totals.profit);
    doc.save('buildkhata-report.pdf');
  }
  function emailReportFlow(){
    if(!S.features.email){toast('Email is off. Add a Resend key on the server.','err');return;}
    var to=prompt('Send report to which email?',S.user?S.user.email:'');if(!to)return;
    var b=rangeBounds();
    api('sendReportNow',{projectId:S.projectId,to:to,from:b.from,until:b.to}).then(function(){toast('Report sent','ok');}).catch(function(e){toast(errMsg(e),'err');});
  }

  /* ======================= NOTIFICATIONS (email set server-side; in-app here) ======================= */
  var shownReminders={};
  function startNotifications(){
    if('Notification'in window&&Notification.permission==='default'){try{Notification.requestPermission();}catch(e){}}
    notifyCheck();refreshNotif();setInterval(function(){notifyCheck();refreshNotif();},60000);
  }
  function refreshNotif(){
    api('notifications',{}).then(function(d){S.notif=d||{count:0,items:[]};paintBadges();}).catch(function(){});
  }
  function paintBadges(){
    var n=(S.notif&&S.notif.count)||0,txt=n>9?'9+':String(n);
    [$('#nbadgeS'),$('#nbadgeM'),$('#anbadgeS'),$('#anbadgeM')].forEach(function(b){if(!b)return;b.textContent=n?txt:'';b.classList.toggle('show',!!n);});
    // admin section badges (pending users / open tickets)
    if(S.user&&S.user.role==='admin'&&S.notif&&S.notif.items){
      var pu=0,ot=0;S.notif.items.forEach(function(it){if(it.kind==='users')pu=it.count;if(it.kind==='tickets')ot=it.count;});
      setNavBadge('ausers',pu);setNavBadge('atickets',ot);
    }
  }
  function setNavBadge(route,count){
    $all('[data-ago="'+route+'"]').forEach(function(el){
      var b=el.querySelector('.secbadge');
      if(!b){b=h('<span class="secbadge"></span>');el.appendChild(b);}
      b.textContent=count?(count>9?'9+':String(count)):'';b.classList.toggle('show',!!count);
    });
  }
  function openNotifPanel(){
    var items=(S.notif&&S.notif.items)||[];
    var isAdmin=S.user&&S.user.role==='admin';
    var body=items.length?items.map(function(it){
      var ic=it.kind==='users'?'user':it.kind==='tickets'||it.kind==='ticket'?'help':it.kind==='ann'?'bell':'bell';
      return '<button class="notif-row" data-nk="'+esc(it.kind)+'"'+(it.id?' data-nid="'+esc(it.id)+'"':'')+'><span class="nr-ic">'+I(ic)+'</span><span class="nr-tx">'+esc(it.text)+'</span></button>';
    }).join(''):'<div class="empty" style="padding:30px 10px"><div class="ei">'+I('bell')+'</div><h3>You are all caught up</h3><p>No new notifications.</p></div>';
    openSheet('Notifications',body,function(root){
      $all('.notif-row',root).forEach(function(b){b.onclick=function(){var k=b.getAttribute('data-nk'),nid=b.getAttribute('data-nid');closeSheet();
        if(k==='ann'){openAnnouncement(nid);return;}
        if(k==='ticket'){openTicketThread(nid,false);return;}
        if(isAdmin){adminGo(k==='users'?'ausers':'atickets');}
        else{openSupportSheet();}
      };});
    });
    // opening clears the user's unread ticket replies + announcements
    if(!isAdmin&&items.length){Promise.all([api('ticketsSeen',{}).catch(function(){}),api('announcementsSeen',{}).catch(function(){})]).then(function(){S.notif={count:0,items:S.notif.items};paintBadges();refreshNotif();});}
  }
  function openAnnouncement(id){
    api('listAnnouncements',{}).then(function(d){var a=(d.announcements||[]).filter(function(x){return x.id===id;})[0];
      if(!a){toast('Announcement not found','err');return;}
      openSheet(a.title,'<div class="th-head"><div class="s">'+fmtDate(a.createdAt)+'</div></div><p style="font-size:14px;line-height:1.6;white-space:pre-wrap">'+esc(a.body)+'</p>');
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function notifyCheck(){
    if(!S.projectId)return;
    api('dueReminders',{projectId:S.projectId}).then(function(d){
      (d.due||[]).forEach(function(r){
        if(shownReminders[r.id])return;shownReminders[r.id]=true;
        var body=fmtDate(r.dueDate)+' '+(r.time||'')+(Number(r.amount)>0?' · '+money(r.amount):'');
        toast('Reminder: '+r.title);
        if('Notification'in window&&Notification.permission==='granted'){try{new Notification('Vozimi reminder',{body:r.title+'\n'+body,icon:'assets/icons/icon-192.png'});}catch(e){}}
      });
    }).catch(function(){});
  }

  /* ======================= SHEET / CONFIRM / FILE UTILS ======================= */
  function openSheet(title,body,onReady){
    var root=$('#modal-root');
    root.innerHTML='<div class="sheet-bg" id="sbg"><div class="sheet"><div class="sheet-h"><h3>'+esc(title)+'</h3><button class="btn-icon" id="sX" aria-label="Close">'+I('close')+'</button></div><div class="sheet-body" id="sBody">'+body+'</div></div></div>';
    $('#sX').onclick=closeSheet;$('#sbg').onclick=function(e){if(e.target.id==='sbg')closeSheet();};
    onReady&&onReady(root);
  }
  function closeSheet(){$('#modal-root').innerHTML='';}
  function confirmSheet(msg,onYes){
    openSheet('Please confirm','<p style="margin:0 0 18px">'+esc(msg)+'</p><div class="row2"><button class="btn btn-ghost" id="cN">Cancel</button><button class="btn btn-danger" id="cY">Confirm</button></div>',function(root){
      $('#cN',root).onclick=closeSheet;$('#cY',root).onclick=function(){closeSheet();onYes();};});
  }
  // For big/irreversible actions: require the account password. run(password) returns a promise.
  function securePrompt(msg,run){
    openSheet('Confirm with password','<p style="margin:0 0 14px;font-size:14px">'+esc(msg)+'</p>'+
      '<div class="field"><div class="pass-wrap"><input id="spwd" type="password" autocomplete="current-password" placeholder="Your account password"/><button type="button" class="pass-eye" id="spwdEye">'+I('eye')+'</button></div></div>'+
      '<button class="btn btn-danger btn-block" id="spwdGo">'+I('shield')+' Confirm</button>',function(root){bindEye('spwdEye','spwd');
      $('#spwdGo',root).onclick=function(){var pw=$('#spwd',root).value;if(!pw){toast('Enter your password','err');return;}var b=$('#spwdGo',root);b.disabled=true;b.innerHTML='<span class="spin"></span>';
        Promise.resolve(run(pw)).then(function(){closeSheet();}).catch(function(e){b.disabled=false;b.innerHTML=I('shield')+' Confirm';toast(e&&e.code==='BAD_CREDENTIALS'?'Wrong password':errMsg(e),'err');});};
    });
  }
  function commandConfirm(title,msg,action,okMsg,after){
    openSheet(title,'<p style="margin:0 0 18px">'+msg+'</p><div class="row2"><button class="btn btn-ghost" id="cN">Cancel</button><button class="btn btn-primary" id="cY">'+I('check')+' Yes</button></div>',function(root){
      $('#cN',root).onclick=closeSheet;
      $('#cY',root).onclick=function(){var btn=$('#cY',root);btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
        Promise.resolve(action()).then(function(){closeSheet();toast(okMsg||'Done','ok');syncProjSel();after?after():(S.route==='dashboard'&&go('dashboard'));}).catch(function(e){btn.disabled=false;btn.innerHTML=I('check')+' Yes';toast(errMsg(e),'err');});};
    });
  }
  function base64ToBlob(b64,mime){var bin=atob(b64),len=bin.length,arr=new Uint8Array(len);for(var i=0;i<len;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime||'application/octet-stream'});}
  function downloadBase64(b64,name,mime){var url=URL.createObjectURL(base64ToBlob(b64,mime));var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);}

  /* ======================= START ======================= */
  /* ---- app lock (device-local PIN) ---- */
  function getLock(){try{return JSON.parse(localStorage.getItem('bk_lock')||'null');}catch(e){return null;}}
  function lockUnlocked(){try{return sessionStorage.getItem('bk_unlocked')==='1';}catch(e){return true;}}
  function pinHash(pin,salt){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(pin)+'|'+salt)).then(function(b){return buf2hex(b);});}
  function showLockScreen(onOk){
    var brand='<div class="auth-brand"><img src="assets/icons/icon.svg" alt=""/> Vozimi</div>';
    authShell(brand+'<div style="text-align:center;padding:4px 0"><div class="auth-tick">'+I('lock')+'</div><h1>Enter your PIN</h1><p class="sub">This device is locked for your privacy.</p></div>'+
      '<div class="field"><input id="lkPin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" style="letter-spacing:8px;text-align:center;font-size:22px;font-weight:700"/></div>'+
      '<div class="auth-err hide" id="lkErr"></div>'+
      '<button class="btn btn-primary btn-block" id="lkGo">Unlock</button>');
    var inp=$('#lkPin');setTimeout(function(){inp&&inp.focus();},80);
    function tryUnlock(){var lock=getLock();if(!lock)return onOk();pinHash(inp.value,lock.salt).then(function(h){if(h===lock.hash){try{sessionStorage.setItem('bk_unlocked','1');}catch(e){}onOk();}else{var er=$('#lkErr');if(er){er.textContent='Wrong PIN';er.classList.remove('hide');}inp.value='';inp.focus();}});}
    $('#lkGo').onclick=tryUnlock;inp.addEventListener('keydown',function(e){if(e.key==='Enter')tryUnlock();});
  }
  function start(){
    applyTheme(getTheme());
    startI18nObserver();
    var proceed=function(){
      if(BK.api.isAuthed()&&BK.apiBase()){
        api('me',{}).then(function(u){S.user={email:u.email,role:u.role,name:u.name||'',whatsapp:u.whatsapp||'',category:u.category||'builder',plan:u.plan||'free',planUntil:u.planUntil||'',readOnly:!!u.readOnly,limits:u.limits||FREE_LIMITS};boot();}).catch(function(e){renderAuth(e.code==='UNAUTHORIZED'?'Please sign in.':'');});
      }else if(/[?&#]signup/.test(location.search+location.hash)){authView('register',{});}else{renderAuth('');}
    };
    if(BK.api.isAuthed()&&getLock()&&!lockUnlocked())showLockScreen(proceed);else proceed();
    if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
    bindConnBanner();
  }
  // A quiet, friendly connectivity banner instead of scary error toasts.
  function bindConnBanner(){
    var el;
    function banner(){if(!el){el=h('<div id="connBanner" class="conn-banner" role="status">You are offline. Changes will not be saved until you reconnect.</div>');document.body.appendChild(el);}return el;}
    banner();updateQueueUi();
    window.addEventListener('offline',updateQueueUi);
    window.addEventListener('online',function(){if(S.user)toast('Back online','ok');flushQueue().then(updateQueueUi);updateQueueUi();});
    // flush anything left from a previous session once we have a token
    if(navigator.onLine!==false&&BK.api.isAuthed())setTimeout(function(){flushQueue().then(updateQueueUi);},1500);
  }
  start();
})();
