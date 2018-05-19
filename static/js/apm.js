(function(window, old) {
  var self = {},
    lastEvent,
    lastScript,
    previousNotification,
    shouldCatch = true,
    ignoreOnError = 0,
    eventsRemaining = 32,
    maxPayloadDepth = 5;
  self.noConflict = function() {
    window.Bugsnag = old;
    if (typeof old === "undefined") {
      delete window.Bugsnag;
    }
    return self;
  };

  self.refresh = function() {
    eventsRemaining = 10;
  };

  self.notifyException = function(exception, name, metaData, severity) {
    if (!exception) {
      return;
    }
    if (name && typeof name !== "string") {
      metaData = name;
      name = undefined;
    }
    if (!metaData) {
      metaData = {};
    }
    addScriptToMetaData(metaData);

    sendToBugsnag({
      name: name || exception.name,
      message: exception.message || exception.description,
      stacktrace: stacktraceFromException(exception) || generateStacktrace(),
      file: exception.fileName || exception.sourceURL,
      lineNumber: exception.lineNumber || exception.line,
      columnNumber: exception.columnNumber ? exception.columnNumber + 1 : undefined,
      severity: severity || "warning"
    }, metaData);
  };

  self.notify = function(name, message, metaData, severity) {
    sendToBugsnag({
      name: name,
      message: message,
      stacktrace: generateStacktrace(),
      file: window.location.toString(),
      lineNumber: 1,
      severity: severity || "warning"
    }, metaData);
  };

  function wrap(_super, options) {
    try {
      if (typeof _super !== "function") {
        return _super;
      }
      if (!_super.bugsnag) {
        var currentScript = getCurrentScript();
        _super.bugsnag = function(event) {
          if (options && options.eventHandler) {
            lastEvent = event;
          }
          lastScript = currentScript;

          if (shouldCatch) {
            try {
              return _super.apply(this, arguments);
            } catch (e) {
              if (getSetting("autoNotify", true)) {
                self.notifyException(e, null, null, "error");
                ignoreNextOnError();
              }
              throw e;
            } finally {
              lastScript = null;
            }
          } else {
            var ret = _super.apply(this, arguments);
            lastScript = null;
            return ret;
          }
        };
        _super.bugsnag.bugsnag = _super.bugsnag;
      }
      return _super.bugsnag;

    } catch (e) {
      return _super;
    }
  }

  var synchronousScriptsRunning = document.readyState !== "complete";

  function loadCompleted() {
    synchronousScriptsRunning = false;
  }

  if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", loadCompleted, true);
    window.addEventListener("load", loadCompleted, true);
  } else {
    window.attachEvent("onload", loadCompleted);
  }

  /**
   * 获取当前的js 元素
   * @returns {*}
   */
  function getCurrentScript() {
    var script = document.currentScript || lastScript;

    if (!script && synchronousScriptsRunning) {
      var scripts = document.scripts || document.getElementsByTagName("script");
      script = scripts[scripts.length - 1];
    }

    return script;
  }

  function addScriptToMetaData(metaData) {
    var script = getCurrentScript();

    if (script) {
      metaData.script = {
        src: script.src,
        content: getSetting("inlineScript", true) ? script.innerHTML : ""
      };
    }
  }

  var API_KEY_REGEX = /^[0-9a-zA-Z]{32}$/i;
  var FUNCTION_REGEX = /function\s*([\w\-$]+)?\s*\(/i;

  var DEFAULT_BASE_ENDPOINT = "http://idcwxtest.dafysz.cn/";
  var DEFAULT_NOTIFIER_ENDPOINT = DEFAULT_BASE_ENDPOINT + "giveu-apm/c/";

  // var scripts = document.getElementsByTagName("script");
  // var thisScript = scripts[scripts.length - 1];
  var thisScript = getCurrentScript();

  function log(msg) {
    var disableLog = getSetting("disableLog");

    var console = window.console;
    if (console !== undefined && console.log !== undefined && !disableLog) {
      console.log("[apm] " + msg);
    }
  }

  /**
   * 返回get方法传递参数的字符串类型
   * @param obj 需要被解析的对象
   * @param prefix
   * @param depth
   * @returns {string}
   */
  function serialize(obj, prefix, depth) {
    var maxDepth = getSetting("maxDepth", maxPayloadDepth);

    if (depth >= maxDepth) {
      return encodeURIComponent(prefix) + "=[RECURSIVE]";
    }
    depth = depth + 1 || 1;

    try {
      if (window.Node && obj instanceof window.Node) {
        return encodeURIComponent(prefix) + "=" + encodeURIComponent(targetToString(obj));
      }

      var str = [];
      for (var p in obj) {
        if (obj.hasOwnProperty(p) && p != null && obj[p] != null) {
          var k = prefix ? prefix + "[" + p + "]" : p,
            v = obj[p];
          str.push(typeof v === "object" ? serialize(v, k, depth) : encodeURIComponent(k) + "=" + encodeURIComponent(v));
        }
      }
      return str.join("&");
    } catch (e) {
      return encodeURIComponent(prefix) + "=" + encodeURIComponent("" + e);
    }
  }

  /**
   * 合并2个obj的属性
   * @param target 目标对象
   * @param source 源对象
   * @param depth
   * @returns {*}
   */
  function merge(target, source, depth) {
    if (source == null) {
      return target;
    } else if (depth >= getSetting("maxDepth", maxPayloadDepth)) {
      return "[RECURSIVE]";
    }

    target = target || {};
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        try {
          if (source[key].constructor === Object) {
            target[key] = merge(target[key], source[key], depth + 1 || 1);
          } else {
            target[key] = source[key];
          }
        } catch (e) {
          target[key] = source[key];
        }
      }
    }

    return target;
  }

  var eid = (Math.random()+'').substr(2),
    apikey = getSetting("apikey")
  var common = {
    eid: eid,
    apikey: apikey,
    // url:location.origin + location.pathname,  request函数内赋值
    // title:document.title,  request函数内赋值
    // t:(new Date())*1,  request函数内赋值
    // ip:?,
    geo:null,
    // city:?,
    // bowser:{name: "Chromium", version: "15.0.874.106"},
    // os:{name: "Linux;Android", version: " 6.0"},
    size:window.screen.availWidth + '*' + window.screen.availHeight,
    // nt:网络类型（wifi/5g）,
    st:'', // 已经实现
    // ref:来源 + 加载来源（navigation.type）
  }


  /**
   * 发送数据
   * @param url
   * @param params
   * @param error
   */
  function request(url, params, error) {
    if (error) {
      url += "?" + serialize(error)
    } else {
      url += "?" + serialize(merge(common, {
          url:location.href.substr(0, 200),
          title:document.title,
          t:(new Date())*1,
          r:(Math.random()+'').substr(2)
        }))
    }

    // if (typeof BUGSNAG_TESTING !== "undefined" && self.testRequest) {
    //   self.testRequest(url, params);
    // } else {
    // var notifyHandler = getSetting("notifyHandler");
    // if (notifyHandler === "xhr") {
    // var xhr = new XMLHttpRequest();
    // xhr.open("POST", url, true);
    // xhr.send(JSON.stringify(params));
    // } else {
    //   var img = new Image();
    //   img.src = url;
    //   }
    // }

    // var data = new Blob([JSON.stringify(params)], {
    //   type: 'application/json'
    // })

    try {
      navigator.sendBeacon(url, JSON.stringify(params))
    } catch (e) {
      xhr(url, JSON.stringify(params));
    }
  }

  function xhr (url, data){
    var xhr = new XMLHttpRequest()
    xhr.open("POST",url,true)
    xhr.send(data)
  }

  /**
   * 获取引入 此js的标签上的属性
   * @param node
   * @returns {{}}
   */
  function getData(node) {
    var dataAttrs = {};
    var dataRegex = /^data\-([\w\-]+)$/;
    if (node) {
      var attrs = node.attributes;
      for (var i = 0; i < attrs.length; i++) {
        var attr = attrs[i];
        if (dataRegex.test(attr.nodeName)) {
          var key = attr.nodeName.match(dataRegex)[1];
          dataAttrs[key] = attr.value || attr.nodeValue;
        }
      }
    }
    return dataAttrs;
  }

  var data;
  /**
   * 验证设置的值
   * @param name
   * @param fallback  此为为设置值的情况下的返回值
   * @returns {*}
   */
  function getSetting(name, fallback) {
    data = data || getData(thisScript);
    var setting = self[name] !== undefined ? self[name] : data[name.toLowerCase()];
    if (setting === "false") {
      setting = false;
    }
    return setting !== undefined ? setting : fallback;
  }

  /**
   * 验证apiKey
   * @param apikey
   * @returns {boolean}
   */
  function validateApiKey(apikey) {
    if (!apikey || !apikey.match(API_KEY_REGEX)) {
      log("Invalid API key '" + apikey + "'");
      return false;
    }
    return true;
  }

  function sendToBugsnag(details, metaData) {
    // if (!validateApiKey(apikey) || !eventsRemaining) {
    //   return;
    // }
    eventsRemaining -= 1;

    var releaseStage = getSetting("releaseStage", "production");
    var notifyReleaseStages = getSetting("notifyReleaseStages");
    if (notifyReleaseStages) {
      var shouldNotify = false;
      for (var i = 0; i < notifyReleaseStages.length; i++) {
        if (releaseStage === notifyReleaseStages[i]) {
          shouldNotify = true;
          break;
        }
      }

      if (!shouldNotify) {
        return;
      }
    }

    var deduplicate = [details.name, details.message, details.stacktrace].join("|");
    if (deduplicate === previousNotification) {
      return;
    } else {
      previousNotification = deduplicate;
    }

    if (lastEvent) {
      metaData = metaData || {};
      metaData["Last Event"] = eventToMetaData(lastEvent);
    }

    var payload = {
      // projectRoot: getSetting("projectRoot") || window.location.protocol + "//" + window.location.host,
      // context: getSetting("context") || window.location.pathname,
      // userId: getSetting("userId"), // Deprecated, remove in v3
      // user: getSetting("user"),
      // metaData: merge(merge({}, getSetting("metaData")), metaData),
      // releaseStage: releaseStage,
      // severity: details.severity,
      // name: details.name,
      msg: details.message,
      // stacktrace: details.stacktrace,
      source: details.file,
      line: details.lineNumber,
      col: details.columnNumber
    };

    var beforeNotify = self.beforeNotify;
    if (typeof(beforeNotify) === "function") {
      var retVal = beforeNotify(payload, payload.metaData);
      if (retVal === false) {
        return;
      }
    }

    if (payload.lineNumber === 0 && (/Script error\.?/).test(payload.message)) {
      return log("Ignoring cross-domain script error. See https://bugsnag.com/docs/notifiers/js/cors");
    }

    request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, payload, {
      n: 'err',
      eid: eid,
      apikey: apikey,
      url: location.href.substr(0, 200),
      title: document.title,
      t:(new Date())*1,
      r: (Math.random()+'').substr(2)
    });
  }

  function generateStacktrace() {
    var generated, stacktrace;
    var MAX_FAKE_STACK_SIZE = 10;
    var ANONYMOUS_FUNCTION_PLACEHOLDER = "[anonymous]";

    try {
      throw new Error("");
    } catch (exception) {
      generated = "<generated>\n";
      stacktrace = stacktraceFromException(exception);
    }

    if (!stacktrace) {
      generated = "<generated-ie>\n";
      var functionStack = [];
      try {
        var curr = arguments.callee.caller.caller;
        while (curr && functionStack.length < MAX_FAKE_STACK_SIZE) {
          var fn = FUNCTION_REGEX.test(curr.toString()) ? RegExp.$1 || ANONYMOUS_FUNCTION_PLACEHOLDER : ANONYMOUS_FUNCTION_PLACEHOLDER;
          functionStack.push(fn);
          curr = curr.caller;
        }
      } catch (e) {
        log(e);
      }
      stacktrace = functionStack.join("\n");
    }

    return generated + stacktrace;
  }

  function stacktraceFromException(exception) {
    return exception.stack || exception.backtrace || exception.stacktrace;
  }

  function eventToMetaData(event) {
    var tab = {
      millisecondsAgo: new Date() - event.timeStamp,
      type: event.type,
      which: event.which,
      target: targetToString(event.target)
    };

    return tab;
  }

  function targetToString(target) {
    if (target) {
      var attrs = target.attributes;

      if (attrs) {
        var ret = "<" + target.nodeName.toLowerCase();
        for (var i = 0; i < attrs.length; i++) {
          if (attrs[i].value && attrs[i].value.toString() !== "null") {
            ret += " " + attrs[i].name + "=\"" + attrs[i].value + "\"";
          }
        }
        return ret + ">";
      } else {
        // e.g. #document
        return target.nodeName;
      }
    }
  }

  function ignoreNextOnError() {
    ignoreOnError += 1;
    window.setTimeout(function() {
      ignoreOnError -= 1;
    });
  }

  if (!window.atob) {
    shouldCatch = false;

  } else if (window.ErrorEvent) {
    try {
      if (new window.ErrorEvent("test").colno === 0) {
        shouldCatch = false;
      }
    } catch (e) { /* No action needed */ }
  }


  function polyFill(obj, name, makeReplacement) {
    var original = obj[name];
    var replacement = makeReplacement(original);
    obj[name] = replacement;

    if (typeof BUGSNAG_TESTING !== "undefined" && window.undo) {
      window.undo.push(function() {
        obj[name] = original;
      });
    }
  }

  var length = 0;
  function perf() {
    if (window.performance === 'undefined') {
      log('performance does not support')
      return false;
    }

    var time = window.performance.timing;
    var entries = performance.getEntries? window.performance.getEntries() : [];

    var payload = {
      entries:[],
      perf: {
        // connect: time.connectEnd - time.connectStart,
        // pageloadtime: time.loadEventStart - time.navigationStart,
        // ttfb: time.responseStart - time.navigationStart,
        req: time.responseStart - time.requestStart,
        // response: time.responseEnd - time.responseStart,
        dom: time.domContentLoadedEventStart - time.responseEnd,
        // domReady: '',
        load: time.loadEventStart > 0 ? time.loadEventStart - time.domLoading : 0,
        tcp: time.connectEnd - time.connectStart,
        dns: time.domainLookupEnd - time.domainLookupStart,
        bnk: window.chrome ? chrome.loadTimes().firstPaintTime - chrome.loadTimes().startLoadTime : 0,  //白屏耗时
        fst: 0,  //首屏耗时
        // operation_time: 0,
        end: time.loadEventEnd > 0 ? time.loadEventEnd - time.responseStart : time.domLoading - time.responseStart,   //总耗时
        // last_unload: time.unloadEventEnd - time.unloadEventStart,
        redirect: time.redirectEnd - time.redirectStart, // 重定向时间
        ready: time.domInteractive > 0 ? time.domInteractive - time.navigationStart : 0,   //用户可操作耗时
        ssl: time.secureConnectionStart > 0 ? time.connectEnd - time.secureConnectionStart : 0,    //SSL握手时间
        html: time.responseEnd - time.domainLookupStart, //html 加载时间
        render: time.loadEventEnd > 0 ? time.loadEventEnd - time.responseEnd : 0, //页面渲染时间
        resource: time.loadEventEnd > 0 ? time.loadEventEnd - time.domContentLoadedEventEnd : 0, //资源 加载时间
        stalled: time.requestStart - time.navigationStart -
        (time.domainLookupEnd - time.domainLookupStart) -
        (time.connectEnd - time.connectStart) -
        (time.secureConnectionStart > 0 ? time.connectEnd - time.secureConnectionStart : 0)
      }
    }

    for(var i = length; i < entries.length; i++){
      if(entries[i].name.indexOf(DEFAULT_NOTIFIER_ENDPOINT) < 0){
        payload.entries.push({
          dns: entries[i].domainLookupEnd - entries[i].domainLookupStart,
          duration: entries[i].duration,
          name: entries[i].name,
          // network: '',
          status: 200,
          req: entries[i].responseEnd - entries[i].startTime,
          tcp: entries[i].connectEnd - entries[i].connectStart,
          type: entries[i].initiatorType,
          ssl: entries[i].secureConnectionStart >0 ? entries[i].connectEnd - entries[i].secureConnectionStart : 0,    //SSL握手时间
          stalled: entries[i].requestStart -
          (entries[i].domainLookupEnd - entries[i].domainLookupStart) -
          (entries[i].connectEnd - entries[i].connectStart) -
          (entries[i].secureConnectionStart > 0 ? entries[i].connectEnd - entries[i].secureConnectionStart : 0)
        })
      }
    }
    length = entries.length;

    // 只有请求成功的资源才会被统计在这个对象里面

    // function getCSS() {
    //   var getEntries = window.getEntries();

    //   var res = [];
    //   for (var i = 0; i < getEntries.length; i++) {
    //     if (getEntries[i].initiatorType === 'link') {
    //       value.push(getEntries[i].name);
    //     } else if(getEntries[i].initiatorType === 'script') {
    //       // value.push(getEntries[i].name);
    //     } else if(getEntries[i].initiatorType === 'css') {

    //   }

    //   return res;
    // }

    if(thisScript.getAttribute('wechat') !== null){
      wx.getLocation({
        type: 'wgs84',
        success: function (res) {
          common.geo = {
            latitude: res.latitude,
            longitude: res.longitude
          }
        }
      });
    }

    request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, payload);

  }


  //performance.getEntriesByName = performance.getEntriesByName || new Function("var entries = performance.getEntries(),newArr = [];for(var i = 0; i<entries.length; i++){if(entries[i].name === arguments[0]){newArr.push(entries[i])}};return newArr;");
  function xxs() {
    /*    var open = window.XMLHttpRequest.prototype.open,
     send = window.XMLHttpRequest.prototype.send;

     var http = {
     apikey: getSetting("apikey"),
     name: 'ajax',
     domain: window.location.host,
     type: 'xhr',
     };

     window.XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
     http.method = method;

     if(/^http|https/g.test(url)) {
     http.url = url;
     } else {
     http.url = window.location.origin+url;
     }


     request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http);

     return open.apply(this, arguments);
     }

     window.XMLHttpRequest.prototype.send = function(data) {
     http.data = data;
     request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http);

     return send.apply(this, arguments);
     }*/
    if ( typeof window.CustomEvent !== "function" ){
      var customEvent = function ( event, params ) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        var evt = document.createEvent( 'CustomEvent' );
        evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
        return evt;
      }

      customEvent.prototype = window.Event.prototype;

      window.CustomEvent = customEvent;
    }

    function ajaxEventTrigger(event) {
      var ajaxEvent = new CustomEvent(event, { detail: this });
      window.dispatchEvent(ajaxEvent);
    }

    var oldXHR = window.XMLHttpRequest;

    function http(xhr, obj) {
      var http = {
        domain: window.location.host,
        status: xhr.status,
        readyState: xhr.readyState
      }
      obj && merge(http, obj)
      if(/^http|https/g.test(xhr.responseURL)) {
        http.url = xhr.responseURL;
      } else {
        http.url = window.location.origin + xhr.responseURL;
      }
      return http
    }

    function newXHR() {
      var realXHR = new oldXHR();

      realXHR.addEventListener('abort', function () {
        // request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http(this, 'abort'));
        ajaxEventTrigger.call(this, 'ajaxAbort');
      }, false);

      realXHR.addEventListener('error', function (e) {
        // request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http(this, {
        //   event: 'error',
        //   massage: e.massage,
        //   errorName: e.name
        // }));
        ajaxEventTrigger.call(this, 'ajaxError');
      }, false);

      realXHR.addEventListener('load', function () {
        // request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http(this, 'load'));
        ajaxEventTrigger.call(this, 'ajaxLoad');
      }, false);

      realXHR.addEventListener('loadstart', function () {
        // request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http(this, 'loadstart'));
        ajaxEventTrigger.call(this, 'ajaxLoadStart');
      }, false);

      realXHR.addEventListener('progress', function () {
        // request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http(this, 'progress'));
        ajaxEventTrigger.call(this, 'ajaxProgress');
      }, false);

      realXHR.addEventListener('timeout', function () {
        // request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http(this, 'timeout'));
        ajaxEventTrigger.call(this, 'ajaxTimeout');
      }, false);

      realXHR.addEventListener('loadend', function () {
        // request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http(this, 'loadend'));
        ajaxEventTrigger.call(this, 'ajaxLoadEnd');
      }, false);

      var xhrStartTime,
        xhrEndTime
      realXHR.addEventListener('readystatechange', function() {
        if(this.responseURL.indexOf(DEFAULT_NOTIFIER_ENDPOINT) < 0 && !/tingyun\.com/.test(this.responseURL)){
          if(this.readyState === 1){
            xhrStartTime = new Date();
          }
          if(this.readyState === 4){
            xhrEndTime = new Date();
            var self = this,
              payload = {};
            if (window.performance.getEntries) {
              var entries = window.performance.getEntriesByName(self.responseURL),
                timing = entries[entries.length - 1];
              if (timing) {
                payload = {
                  dns: timing.domainLookupEnd - timing.domainLookupStart,
                  duration: timing.duration,
                  req: timing.responseEnd - timing.startTime,
                  tcp: timing.connectEnd - timing.connectStart,
                  ssl: timing.secureConnectionStart >0 ? timing.connectEnd - timing.secureConnectionStart : 0,    //SSL握手时间
                  stalled: timing.requestStart -
                  (timing.domainLookupEnd - timing.domainLookupStart) -
                  (timing.connectEnd - timing.connectStart) -
                  (timing.secureConnectionStart > 0 ? timing.connectEnd - timing.secureConnectionStart : 0)
                }
              }
            }
            payload.network = xhrEndTime - xhrStartTime
            setTimeout(function () {
              request(getSetting("endpoint") || DEFAULT_NOTIFIER_ENDPOINT, http(self, {
                event: 'readystatechange',
                timing: payload
              }));
            }, 500)
          }
        }
        ajaxEventTrigger.call(this, 'ajaxReadyStateChange');
      }, false);

      return realXHR;
    }

    window.XMLHttpRequest = newXHR;
  }

  if (getSetting("autoNotify", true)) {
    xxs();
    setTimeout(function () {
      perf();
    },500);
  }

  var startTime = new Date();
  window.addEventListener('hashchange', function(){
    var changeTime = new Date();
    common.st = changeTime - startTime
    startTime = changeTime
    setTimeout(function () {
      perf();
    },500);
  })


  if (getSetting("autoNotify", true)) {
    polyFill(window, "onerror", function(_super) {
      if (typeof BUGSNAG_TESTING !== "undefined") {
        self._onerror = _super;
      }

      return function bugsnag(message, url, lineNo, charNo, exception) {
        var shouldNotify = getSetting("autoNotify", true);
        var metaData = {};

        if (!charNo && window.event) {
          charNo = window.event.errorCharacter;
        }

        addScriptToMetaData(metaData);
        lastScript = null;

        if (shouldNotify && !ignoreOnError) {

          sendToBugsnag({
            name: exception && exception.name || "window.onerror",
            message: message,
            file: url,
            lineNumber: lineNo,
            columnNumber: charNo,
            stacktrace: (exception && stacktraceFromException(exception)) || generateStacktrace(),
            severity: "error"
          }, metaData);
        }

        if (typeof BUGSNAG_TESTING !== "undefined") {
          _super = self._onerror;
        }

        if (_super) {
          _super(message, url, lineNo, charNo, exception);
        }
      };
    });

    var hijackTimeFunc = function(_super) {
      return function(f, t) {
        if (typeof f === "function") {
          f = wrap(f);
          var args = Array.prototype.slice.call(arguments, 2);
          return _super(function() {
            f.apply(this, args);
          }, t);
        } else {
          return _super(f, t);
        }
      };
    };

    polyFill(window, "setTimeout", hijackTimeFunc);
    polyFill(window, "setInterval", hijackTimeFunc);

    if (window.requestAnimationFrame) {
      polyFill(window, "requestAnimationFrame", function(_super) {
        return function(callback) {
          return _super(wrap(callback));
        };
      });
    }

    if (window.setImmediate) {
      polyFill(window, "setImmediate", function(_super) {
        return function() {
          var args = Array.prototype.slice.call(arguments);
          args[0] = wrap(args[0]);
          return _super.apply(this, args);
        };
      });
    }

    "EventTarget Window Node ApplicationCache AudioTrackList ChannelMergerNode CryptoOperation EventSource FileReader HTMLUnknownElement IDBDatabase IDBRequest IDBTransaction KeyOperation MediaController MessagePort ModalWindow Notification SVGElementInstance Screen TextTrack TextTrackCue TextTrackList WebSocket WebSocketWorker Worker XMLHttpRequest XMLHttpRequestEventTarget XMLHttpRequestUpload".replace(/\w+/g, function(global) {
      var prototype = window[global] && window[global].prototype;
      if (prototype && prototype.hasOwnProperty && prototype.hasOwnProperty("addEventListener")) {
        polyFill(prototype, "addEventListener", function(_super) {
          return function(e, f, capture, secure) {
            try {
              if (f && f.handleEvent) {
                f.handleEvent = wrap(f.handleEvent, {
                  eventHandler: true
                });
              }
            } catch (err) {
              log(err);
            }
            return _super.call(this, e, wrap(f, {
              eventHandler: true
            }), capture, secure);
          };
        });

        polyFill(prototype, "removeEventListener", function(_super) {
          return function(e, f, capture, secure) {
            _super.call(this, e, f, capture, secure);
            return _super.call(this, e, wrap(f), capture, secure);
          };
        });
      }
    });
  }

  window.Bugsnag = self;
  if (typeof define === "function" && define.amd) {
    define([], function() {
      return self;
    });
  } else if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = self;
  }

})(window, window.Bugsnag);
