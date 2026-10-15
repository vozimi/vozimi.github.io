/* voice.js — speech-to-text (Web Speech API). Only TEXT leaves the device.
 * Listens continuously and stops ONLY when the user taps stop. If the browser
 * ends the session on silence, we transparently restart it. */
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  BK.voice = {
    supported: !!SR,
    _rec: null,
    _userStopped: false,
    _finalText: '',
    listening: false,

    /** start(onResult, onDone, onError) — onResult(fullTranscript) live; onDone(finalText) on manual stop */
    start: function (onResult, onDone, onError) {
      if (!SR) { onError && onError('unsupported'); return; }
      var self = this;
      self._userStopped = false;
      self._finalText = '';

      function makeRec() {
        var rec = new SR();
        var lang = 'en-IN';
        try { lang = localStorage.getItem('bk_lang') || 'en-IN'; } catch (e) {}
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = true;
        rec.maxAlternatives = 1;
        rec.onresult = function (e) {
          var interim = '';
          for (var i = e.resultIndex; i < e.results.length; i++) {
            var t = e.results[i][0].transcript;
            if (e.results[i].isFinal) self._finalText += t + ' '; else interim += t;
          }
          onResult && onResult((self._finalText + interim).trim());
        };
        rec.onerror = function (e) {
          if (e.error === 'no-speech' || e.error === 'aborted') return; // keep going
          self.listening = false;
          onError && onError(e.error || 'error');
        };
        rec.onend = function () {
          if (self._userStopped) { self.listening = false; onDone && onDone(self._finalText.trim()); }
          else { try { rec.start(); } catch (e) { /* retry next tick */ setTimeout(function () { try { rec.start(); } catch (e2) {} }, 250); } }
        };
        return rec;
      }
      self._rec = makeRec();
      self.listening = true;
      try { self._rec.start(); } catch (e) { self.listening = false; onError && onError('start-failed'); }
    },

    stop: function () {
      this._userStopped = true;
      try { this._rec && this._rec.stop(); } catch (e) {}
    }
  };
})();
