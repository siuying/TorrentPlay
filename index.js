(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var pirateship = require('pirateship');

pirateship.search(pirateship.categories.video.tv, 'Human', function (results) {
    console.log(results);
}, function (error) {
    console.error(error);
});

},{"pirateship":2}],2:[function(require,module,exports){
var request = require('request');
var url = require('url');
var async = require('async');
var magnet = require('magnet-uri');

var categories = {
	audio: {
		music: 101,
		audiobooks: 102,
		soundclips: 103,
		flac: 104,
		other: 199
	},
	video: {
		movies: 201,
		moviesdvdr: 202,
		musicvideos: 203,
		movieclips: 204,
		tvshows: 205,
		handheld: 206,
		hdmovies: 207,
		hdtvshows: 208,
		movies3d: 209,
		other: 299
	},
	application: {
		windows: 301,
		mac: 302,
		unix: 303,
		handheld: 304,
		ios: 305,
		android: 306,
		other: 399
	},
	games: {
		pc: 401,
		mac: 402,
		psx: 403,
		xbox360: 404,
		wii: 405,
		handheld: 406,
		ios: 407,
		android: 408,
		other: 499
	},
	porn: {
		movies: 501,
		moviesdvdr: 502,
		pictures: 503,
		games: 504,
		hdmovies: 505,
		movieclips: 506,
		other: 599
	},
	other: {
		ebooks: 601,
		comics: 602,
		pictures: 603,
		covers: 604,
		physibles: 605,
		other: 699
	}
};

function perror(err) {
	console.trace(err);
}

function getProxies(success, fail) {
	fail = fail || perror;

	request({
		url: 'http://proxybay.info/list.txt',
		timeout: 60000
	}, function(error, response, body) {
		if (error)
			return fail(error);

		var proxies = [url.parse('http://thepiratebay.se'), url.parse('http://thepiratebay.org')];

		proxies = proxies.concat(body.split('\n\n')[1].split('\n').map(function(e) {
			return url.parse(e);
		}));

		proxies.pop();

		var parallel = [];

		proxies.forEach(function(proxy) {
			parallel.push(function(callback) {
				(function(proxy) {
					var start = new Date();
					request({
						url: proxy.protocol + '//' + proxy.host,
						timeout: 2000
					}, function(error, response, body) {
						if (error)
							return callback();

						if (body.match('title="Pirate Search"') === null)
							return callback();

						proxy.ping = new Date() - start;
						callback();
					});
				})(proxy);
			});
		});

		async.parallel(parallel, function(error) {
			if (error)
				return fail(error);

			proxies = proxies.filter(function(proxy) {
				return ('ping' in proxy);
			});

			proxies.sort(function(a, b) {
				if (a.ping < b.ping) return -1;
				if (a.ping > b.ping) return 1;
				return 0;
			});

			success(proxies);
		});
	});
}

var bestProxy = null;

function getBestProxy(success, fail) {
	if (bestProxy)
		success(bestProxy);

	getProxies(function(proxies) {
		bestProxy = proxies[0];
		success(bestProxy);
	}, fail);
}

function parseResultsPage(body, success, fail) {
	if (body.match('<table id="searchResult">') !== null) {
		var data = body.split('detName');
		data.shift();

		data = data.map(function(e) {
			var parsed = {};
			var match = e.match(/href="(magnet:.+?)"/);

			if (match !== null) {
				parsed.magnet = magnet(match[1]);

				if ('dn' in parsed.magnet)
					parsed.magnet.dn = unescape(decodeURI(parsed.magnet.dn).replace(/[\+\.]/g, ' '));
			} else
				return undefined;

			match = e.match(/href="(\/torrent\/.+?)"/);

			if (match !== null)
				parsed.page = match[1];

			return parsed;
		}).filter(function(e) {
			return e !== undefined;
		});

		success(data);
	} else {
		return fail();
	}
}

function top(category, success, fail, tries) {
	fail = fail || perror;
	tries = tries || 1;

	if (tries > 5)
		return fail(new Error('Can not connect to the piratebay.'));

	getBestProxy(function(proxy) {
		request({
			url: proxy.protocol + '//' + proxy.host + '/top/' + category
		}, function(error, response, body) {
			if (error)
				return fail(error);

			parseResultsPage(body, success, function() {
				top(category, success, fail, ++tries);
			});
		});
	}, fail);
}

function search(category, query, success, fail, tries) {
	fail = fail || perror;
	tries = tries || 1;

	if (tries > 5)
		return fail(new Error('Can not connect to the piratebay.'));

	getBestProxy(function(proxy) {
		request({
			url: proxy.protocol + '//' + proxy.host + '/search/' + query + '/0/7/' + category
		}, function(error, response, body) {
			if (error)
				return fail(error);

			parseResultsPage(body, success, function() {
				search(category, query, success, fail, ++tries);
			});
		});
	}, fail);
}

function addInfo(results, success, fail) {
	fail = fail || perror;

	getBestProxy(function(proxy) {
		var parallel = [];

		results.forEach(function(result) {
			if ('page' in result)
				parallel.push(function(callback) {
					(function(result) {
						request({
							url: proxy.protocol + '//' + proxy.host + result.page
						}, function(error, response, body) {
							if (error)
								return callback(error);

							var match = body.match(/<a href="(http:\/\/www.imdb.com\/title\/.+?\/)"/);

							if(match !== null)
								result.imdburl = url.parse([1]);

							callback();
						});
					})(result);
				});
		});

		async.parallel(parallel, function(error) {
			if (error)
				return fail(error);

			success(results);
		});
	}, fail);
}

exports.categories = categories;
exports.top = top;
exports.search = search;
exports.info = addInfo;
},{"async":3,"magnet-uri":4,"request":7,"url":undefined}],3:[function(require,module,exports){
/*global setImmediate: false, setTimeout: false, console: false */
(function () {

    var async = {};

    // global on the server, window in the browser
    var root, previous_async;

    root = this;
    if (root != null) {
      previous_async = root.async;
    }

    async.noConflict = function () {
        root.async = previous_async;
        return async;
    };

    function only_once(fn) {
        var called = false;
        return function() {
            if (called) throw new Error("Callback was already called.");
            called = true;
            fn.apply(root, arguments);
        }
    }

    //// cross-browser compatiblity functions ////

    var _each = function (arr, iterator) {
        if (arr.forEach) {
            return arr.forEach(iterator);
        }
        for (var i = 0; i < arr.length; i += 1) {
            iterator(arr[i], i, arr);
        }
    };

    var _map = function (arr, iterator) {
        if (arr.map) {
            return arr.map(iterator);
        }
        var results = [];
        _each(arr, function (x, i, a) {
            results.push(iterator(x, i, a));
        });
        return results;
    };

    var _reduce = function (arr, iterator, memo) {
        if (arr.reduce) {
            return arr.reduce(iterator, memo);
        }
        _each(arr, function (x, i, a) {
            memo = iterator(memo, x, i, a);
        });
        return memo;
    };

    var _keys = function (obj) {
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                keys.push(k);
            }
        }
        return keys;
    };

    //// exported async module functions ////

    //// nextTick implementation with browser-compatible fallback ////
    if (typeof process === 'undefined' || !(process.nextTick)) {
        if (typeof setImmediate === 'function') {
            async.nextTick = function (fn) {
                // not a direct alias for IE10 compatibility
                setImmediate(fn);
            };
            async.setImmediate = async.nextTick;
        }
        else {
            async.nextTick = function (fn) {
                setTimeout(fn, 0);
            };
            async.setImmediate = async.nextTick;
        }
    }
    else {
        async.nextTick = process.nextTick;
        if (typeof setImmediate !== 'undefined') {
            async.setImmediate = function (fn) {
              // not a direct alias for IE10 compatibility
              setImmediate(fn);
            };
        }
        else {
            async.setImmediate = async.nextTick;
        }
    }

    async.each = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        _each(arr, function (x) {
            iterator(x, only_once(function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback(null);
                    }
                }
            }));
        });
    };
    async.forEach = async.each;

    async.eachSeries = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        var iterate = function () {
            iterator(arr[completed], function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback(null);
                    }
                    else {
                        iterate();
                    }
                }
            });
        };
        iterate();
    };
    async.forEachSeries = async.eachSeries;

    async.eachLimit = function (arr, limit, iterator, callback) {
        var fn = _eachLimit(limit);
        fn.apply(null, [arr, iterator, callback]);
    };
    async.forEachLimit = async.eachLimit;

    var _eachLimit = function (limit) {

        return function (arr, iterator, callback) {
            callback = callback || function () {};
            if (!arr.length || limit <= 0) {
                return callback();
            }
            var completed = 0;
            var started = 0;
            var running = 0;

            (function replenish () {
                if (completed >= arr.length) {
                    return callback();
                }

                while (running < limit && started < arr.length) {
                    started += 1;
                    running += 1;
                    iterator(arr[started - 1], function (err) {
                        if (err) {
                            callback(err);
                            callback = function () {};
                        }
                        else {
                            completed += 1;
                            running -= 1;
                            if (completed >= arr.length) {
                                callback();
                            }
                            else {
                                replenish();
                            }
                        }
                    });
                }
            })();
        };
    };


    var doParallel = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.each].concat(args));
        };
    };
    var doParallelLimit = function(limit, fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [_eachLimit(limit)].concat(args));
        };
    };
    var doSeries = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.eachSeries].concat(args));
        };
    };


    var _asyncMap = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (err, v) {
                results[x.index] = v;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    };
    async.map = doParallel(_asyncMap);
    async.mapSeries = doSeries(_asyncMap);
    async.mapLimit = function (arr, limit, iterator, callback) {
        return _mapLimit(limit)(arr, iterator, callback);
    };

    var _mapLimit = function(limit) {
        return doParallelLimit(limit, _asyncMap);
    };

    // reduce only has a series version, as doing reduce in parallel won't
    // work in many situations.
    async.reduce = function (arr, memo, iterator, callback) {
        async.eachSeries(arr, function (x, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    };
    // inject alias
    async.inject = async.reduce;
    // foldl alias
    async.foldl = async.reduce;

    async.reduceRight = function (arr, memo, iterator, callback) {
        var reversed = _map(arr, function (x) {
            return x;
        }).reverse();
        async.reduce(reversed, memo, iterator, callback);
    };
    // foldr alias
    async.foldr = async.reduceRight;

    var _filter = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.filter = doParallel(_filter);
    async.filterSeries = doSeries(_filter);
    // select alias
    async.select = async.filter;
    async.selectSeries = async.filterSeries;

    var _reject = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (!v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.reject = doParallel(_reject);
    async.rejectSeries = doSeries(_reject);

    var _detect = function (eachfn, arr, iterator, main_callback) {
        eachfn(arr, function (x, callback) {
            iterator(x, function (result) {
                if (result) {
                    main_callback(x);
                    main_callback = function () {};
                }
                else {
                    callback();
                }
            });
        }, function (err) {
            main_callback();
        });
    };
    async.detect = doParallel(_detect);
    async.detectSeries = doSeries(_detect);

    async.some = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (v) {
                    main_callback(true);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(false);
        });
    };
    // any alias
    async.any = async.some;

    async.every = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (!v) {
                    main_callback(false);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(true);
        });
    };
    // all alias
    async.all = async.every;

    async.sortBy = function (arr, iterator, callback) {
        async.map(arr, function (x, callback) {
            iterator(x, function (err, criteria) {
                if (err) {
                    callback(err);
                }
                else {
                    callback(null, {value: x, criteria: criteria});
                }
            });
        }, function (err, results) {
            if (err) {
                return callback(err);
            }
            else {
                var fn = function (left, right) {
                    var a = left.criteria, b = right.criteria;
                    return a < b ? -1 : a > b ? 1 : 0;
                };
                callback(null, _map(results.sort(fn), function (x) {
                    return x.value;
                }));
            }
        });
    };

    async.auto = function (tasks, callback) {
        callback = callback || function () {};
        var keys = _keys(tasks);
        if (!keys.length) {
            return callback(null);
        }

        var results = {};

        var listeners = [];
        var addListener = function (fn) {
            listeners.unshift(fn);
        };
        var removeListener = function (fn) {
            for (var i = 0; i < listeners.length; i += 1) {
                if (listeners[i] === fn) {
                    listeners.splice(i, 1);
                    return;
                }
            }
        };
        var taskComplete = function () {
            _each(listeners.slice(0), function (fn) {
                fn();
            });
        };

        addListener(function () {
            if (_keys(results).length === keys.length) {
                callback(null, results);
                callback = function () {};
            }
        });

        _each(keys, function (k) {
            var task = (tasks[k] instanceof Function) ? [tasks[k]]: tasks[k];
            var taskCallback = function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                if (err) {
                    var safeResults = {};
                    _each(_keys(results), function(rkey) {
                        safeResults[rkey] = results[rkey];
                    });
                    safeResults[k] = args;
                    callback(err, safeResults);
                    // stop subsequent errors hitting callback multiple times
                    callback = function () {};
                }
                else {
                    results[k] = args;
                    async.setImmediate(taskComplete);
                }
            };
            var requires = task.slice(0, Math.abs(task.length - 1)) || [];
            var ready = function () {
                return _reduce(requires, function (a, x) {
                    return (a && results.hasOwnProperty(x));
                }, true) && !results.hasOwnProperty(k);
            };
            if (ready()) {
                task[task.length - 1](taskCallback, results);
            }
            else {
                var listener = function () {
                    if (ready()) {
                        removeListener(listener);
                        task[task.length - 1](taskCallback, results);
                    }
                };
                addListener(listener);
            }
        });
    };

    async.waterfall = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor !== Array) {
          var err = new Error('First argument to waterfall must be an array of functions');
          return callback(err);
        }
        if (!tasks.length) {
            return callback();
        }
        var wrapIterator = function (iterator) {
            return function (err) {
                if (err) {
                    callback.apply(null, arguments);
                    callback = function () {};
                }
                else {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var next = iterator.next();
                    if (next) {
                        args.push(wrapIterator(next));
                    }
                    else {
                        args.push(callback);
                    }
                    async.setImmediate(function () {
                        iterator.apply(null, args);
                    });
                }
            };
        };
        wrapIterator(async.iterator(tasks))();
    };

    var _parallel = function(eachfn, tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            eachfn.map(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            eachfn.each(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.parallel = function (tasks, callback) {
        _parallel({ map: async.map, each: async.each }, tasks, callback);
    };

    async.parallelLimit = function(tasks, limit, callback) {
        _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
    };

    async.series = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            async.mapSeries(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            async.eachSeries(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.iterator = function (tasks) {
        var makeCallback = function (index) {
            var fn = function () {
                if (tasks.length) {
                    tasks[index].apply(null, arguments);
                }
                return fn.next();
            };
            fn.next = function () {
                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
            };
            return fn;
        };
        return makeCallback(0);
    };

    async.apply = function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function () {
            return fn.apply(
                null, args.concat(Array.prototype.slice.call(arguments))
            );
        };
    };

    var _concat = function (eachfn, arr, fn, callback) {
        var r = [];
        eachfn(arr, function (x, cb) {
            fn(x, function (err, y) {
                r = r.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, r);
        });
    };
    async.concat = doParallel(_concat);
    async.concatSeries = doSeries(_concat);

    async.whilst = function (test, iterator, callback) {
        if (test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.whilst(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doWhilst = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            if (test()) {
                async.doWhilst(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.until = function (test, iterator, callback) {
        if (!test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.until(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doUntil = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            if (!test()) {
                async.doUntil(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.queue = function (worker, concurrency) {
        if (concurrency === undefined) {
            concurrency = 1;
        }
        function _insert(q, data, pos, callback) {
          if(data.constructor !== Array) {
              data = [data];
          }
          _each(data, function(task) {
              var item = {
                  data: task,
                  callback: typeof callback === 'function' ? callback : null
              };

              if (pos) {
                q.tasks.unshift(item);
              } else {
                q.tasks.push(item);
              }

              if (q.saturated && q.tasks.length === concurrency) {
                  q.saturated();
              }
              async.setImmediate(q.process);
          });
        }

        var workers = 0;
        var q = {
            tasks: [],
            concurrency: concurrency,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
              _insert(q, data, false, callback);
            },
            unshift: function (data, callback) {
              _insert(q, data, true, callback);
            },
            process: function () {
                if (workers < q.concurrency && q.tasks.length) {
                    var task = q.tasks.shift();
                    if (q.empty && q.tasks.length === 0) {
                        q.empty();
                    }
                    workers += 1;
                    var next = function () {
                        workers -= 1;
                        if (task.callback) {
                            task.callback.apply(task, arguments);
                        }
                        if (q.drain && q.tasks.length + workers === 0) {
                            q.drain();
                        }
                        q.process();
                    };
                    var cb = only_once(next);
                    worker(task.data, cb);
                }
            },
            length: function () {
                return q.tasks.length;
            },
            running: function () {
                return workers;
            }
        };
        return q;
    };

    async.cargo = function (worker, payload) {
        var working     = false,
            tasks       = [];

        var cargo = {
            tasks: tasks,
            payload: payload,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
                if(data.constructor !== Array) {
                    data = [data];
                }
                _each(data, function(task) {
                    tasks.push({
                        data: task,
                        callback: typeof callback === 'function' ? callback : null
                    });
                    if (cargo.saturated && tasks.length === payload) {
                        cargo.saturated();
                    }
                });
                async.setImmediate(cargo.process);
            },
            process: function process() {
                if (working) return;
                if (tasks.length === 0) {
                    if(cargo.drain) cargo.drain();
                    return;
                }

                var ts = typeof payload === 'number'
                            ? tasks.splice(0, payload)
                            : tasks.splice(0);

                var ds = _map(ts, function (task) {
                    return task.data;
                });

                if(cargo.empty) cargo.empty();
                working = true;
                worker(ds, function () {
                    working = false;

                    var args = arguments;
                    _each(ts, function (data) {
                        if (data.callback) {
                            data.callback.apply(null, args);
                        }
                    });

                    process();
                });
            },
            length: function () {
                return tasks.length;
            },
            running: function () {
                return working;
            }
        };
        return cargo;
    };

    var _console_fn = function (name) {
        return function (fn) {
            var args = Array.prototype.slice.call(arguments, 1);
            fn.apply(null, args.concat([function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _each(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            }]));
        };
    };
    async.log = _console_fn('log');
    async.dir = _console_fn('dir');
    /*async.info = _console_fn('info');
    async.warn = _console_fn('warn');
    async.error = _console_fn('error');*/

    async.memoize = function (fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || function (x) {
            return x;
        };
        var memoized = function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            var key = hasher.apply(null, args);
            if (key in memo) {
                callback.apply(null, memo[key]);
            }
            else if (key in queues) {
                queues[key].push(callback);
            }
            else {
                queues[key] = [callback];
                fn.apply(null, args.concat([function () {
                    memo[key] = arguments;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                      q[i].apply(null, arguments);
                    }
                }]));
            }
        };
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    };

    async.unmemoize = function (fn) {
      return function () {
        return (fn.unmemoized || fn).apply(null, arguments);
      };
    };

    async.times = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.map(counter, iterator, callback);
    };

    async.timesSeries = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.mapSeries(counter, iterator, callback);
    };

    async.compose = function (/* functions... */) {
        var fns = Array.prototype.reverse.call(arguments);
        return function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            async.reduce(fns, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([function () {
                    var err = arguments[0];
                    var nextargs = Array.prototype.slice.call(arguments, 1);
                    cb(err, nextargs);
                }]))
            },
            function (err, results) {
                callback.apply(that, [err].concat(results));
            });
        };
    };

    var _applyEach = function (eachfn, fns /*args...*/) {
        var go = function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            return eachfn(fns, function (fn, cb) {
                fn.apply(that, args.concat([cb]));
            },
            callback);
        };
        if (arguments.length > 2) {
            var args = Array.prototype.slice.call(arguments, 2);
            return go.apply(this, args);
        }
        else {
            return go;
        }
    };
    async.applyEach = doParallel(_applyEach);
    async.applyEachSeries = doSeries(_applyEach);

    async.forever = function (fn, callback) {
        function next(err) {
            if (err) {
                if (callback) {
                    return callback(err);
                }
                throw err;
            }
            fn(next);
        }
        next();
    };

    // AMD / RequireJS
    if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return async;
        });
    }
    // Node.js
    else if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
    }
    // included directly via <script> tag
    else {
        root.async = async;
    }

}());

},{}],4:[function(require,module,exports){
var base32 = require('thirty-two')

/**
 * Parse a magnet URI and return an object of keys/values
 *
 * @param  {string} uri
 * @return {Object} parsed uri
 */

module.exports = function (uri) {
  var result = {}
  var data = uri.split('magnet:?')[1]

  if (!data || data.length === 0)
    return result

  var params = data.split('&')

  params.forEach(function (param) {
    var keyval = param.split('=')

    // This keyval is invalid, skip it
    if (keyval.length !== 2)
      return

    var key = keyval[0]
    var val = keyval[1]

    // Address tracker (tr) is an encoded URI, so decode it
    if (key === 'tr')
      val = decodeURIComponent(val)

    // If there are repeated parameters, return an array of values
    if (result[key]) {
      if (Array.isArray(result[key])) {
        result[key].push(val)
      } else {
        var old = result[key]
        result[key] = [old, val]
      }
    } else {
      result[key] = val
    }
  })

  var m
  if (result.xt && (m = result.xt.match(/^urn:btih:(.{40})/))) {
    result.infoHash = new Buffer(m[1], 'hex').toString('hex')
  } else if (result.xt && (m = result.xt.match(/^urn:btih:(.{32})/))) {
    var decodedStr = base32.decode(m[1])
    result.infoHash = new Buffer(decodedStr, 'binary').toString('hex');
  }

  return result
}

},{"thirty-two":5}],5:[function(require,module,exports){
/*                                                                              
Copyright (c) 2011, Chris Umbel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in      
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN 
THE SOFTWARE.
*/

var base32 = require('./thirty-two');

exports.encode = base32.encode;
exports.decode = base32.decode;

},{"./thirty-two":6}],6:[function(require,module,exports){
/*                                                                              
Copyright (c) 2011, Chris Umbel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.                                                                   
*/

var charTable = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
var byteTable = [
    0xff, 0xff, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
    0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
    0x17, 0x18, 0x19, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
    0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
    0x17, 0x18, 0x19, 0xff, 0xff, 0xff, 0xff, 0xff
];

function quintetCount(buff) {
    var quintets = Math.floor(buff.length / 5);
    return buff.length % 5 == 0 ? quintets: quintets + 1;
}

exports.encode = function(plain) {
    var i = 0;
    var j = 0;
    var shiftIndex = 0;
    var digit = 0;
    var encoded = new Buffer(quintetCount(plain) * 8);
    if(!Buffer.isBuffer(plain)){
    	plain = new Buffer(plain);
    }

    /* byte by byte isn't as pretty as quintet by quintet but tests a bit
        faster. will have to revisit. */
    while(i < plain.length) {
        var current = plain[i];
    
        if(shiftIndex > 3) {
            digit = current & (0xff >> shiftIndex);
            shiftIndex = (shiftIndex + 5) % 8;
            digit = (digit << shiftIndex) | ((i + 1 < plain.length) ?
                plain[i + 1] : 0) >> (8 - shiftIndex);
            i++;
        } else {
            digit = (current >> (8 - (shiftIndex + 5))) & 0x1f;
            shiftIndex = (shiftIndex + 5) % 8;            
            if(shiftIndex == 0) i++;
        }
        
        encoded[j] = charTable.charCodeAt(digit);
        j++;
    }

    for(i = j; i < encoded.length; i++)
        encoded[i] = 0x3d; //'='.charCodeAt(0)
        
    return encoded;
};

exports.decode = function(encoded) {
    var shiftIndex = 0;
    var plainDigit = 0;
    var plainChar;
    var plainPos = 0;
    if(!Buffer.isBuffer(encoded)){
    	encoded = new Buffer(encoded);
    }
    var decoded = new Buffer(Math.ceil(encoded.length * 5 / 8));
    
    /* byte by byte isn't as pretty as octet by octet but tests a bit
        faster. will have to revisit. */    
    for(var i = 0; i < encoded.length; i++) {
    	if(encoded[i] == 0x3d){ //'='
    		break;
    	}
    		
        var encodedByte = encoded[i] - 0x30;
        
        if(encodedByte < byteTable.length) {
            plainDigit = byteTable[encodedByte];
            
            if(shiftIndex <= 3) {
                shiftIndex = (shiftIndex + 5) % 8;
                
                if(shiftIndex == 0) {
                    plainChar |= plainDigit;
                    decoded[plainPos] = plainChar;
                    plainPos++;
                    plainChar = 0;
                } else {
                    plainChar |= 0xff & (plainDigit << (8 - shiftIndex));
                }
            } else {
                shiftIndex = (shiftIndex + 5) % 8;
                plainChar |= 0xff & (plainDigit >>> shiftIndex);
                decoded[plainPos] = plainChar;
                plainPos++;

                plainChar = 0xff & (plainDigit << (8 - shiftIndex));
            }
        } else {
        	throw new Error('Invalid input - it is not base32 encoded string');
        }
    }
    return decoded.slice(0, plainPos);
};

},{}],7:[function(require,module,exports){
// Copyright 2010-2012 Mikeal Rogers
//
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.

'use strict'

var extend                = require('extend')
  , cookies               = require('./lib/cookies')
  , helpers               = require('./lib/helpers')

var isFunction            = helpers.isFunction
  , paramsHaveRequestBody = helpers.paramsHaveRequestBody


// organize params for patch, post, put, head, del
function initParams(uri, options, callback) {
  if (typeof options === 'function') {
    callback = options
  }

  var params = {}
  if (typeof options === 'object') {
    extend(params, options, {uri: uri})
  } else if (typeof uri === 'string') {
    extend(params, {uri: uri})
  } else {
    extend(params, uri)
  }

  params.callback = callback
  return params
}

function request (uri, options, callback) {
  if (typeof uri === 'undefined') {
    throw new Error('undefined is not a valid uri or options object.')
  }

  var params = initParams(uri, options, callback)

  if (params.method === 'HEAD' && paramsHaveRequestBody(params)) {
    throw new Error('HTTP HEAD requests MUST NOT include a request body.')
  }

  return new request.Request(params)
}

function verbFunc (verb) {
  var method = verb === 'del' ? 'DELETE' : verb.toUpperCase()
  return function (uri, options, callback) {
    var params = initParams(uri, options, callback)
    params.method = method
    return request(params, params.callback)
  }
}

// define like this to please codeintel/intellisense IDEs
request.get = verbFunc('get')
request.head = verbFunc('head')
request.post = verbFunc('post')
request.put = verbFunc('put')
request.patch = verbFunc('patch')
request.del = verbFunc('del')

request.jar = function (store) {
  return cookies.jar(store)
}

request.cookie = function (str) {
  return cookies.parse(str)
}

function wrapRequestMethod (method, options, requester, verb) {

  return function (uri, opts, callback) {
    var params = initParams(uri, opts, callback)

    var target = {}
    extend(true, target, options, params)

    if (verb) {
      target.method = (verb === 'del' ? 'DELETE' : verb.toUpperCase())
    }

    if (isFunction(requester)) {
      method = requester
    }

    return method(target, target.callback)
  }
}

request.defaults = function (options, requester) {
  var self = this

  if (typeof options === 'function') {
    requester = options
    options = {}
  }

  var defaults      = wrapRequestMethod(self, options, requester)

  var verbs = ['get', 'head', 'post', 'put', 'patch', 'del']
  verbs.forEach(function(verb) {
    defaults[verb]  = wrapRequestMethod(self[verb], options, requester, verb)
  })

  defaults.cookie   = wrapRequestMethod(self.cookie, options, requester)
  defaults.jar      = self.jar
  defaults.defaults = self.defaults
  return defaults
}

request.forever = function (agentOptions, optionsArg) {
  var options = {}
  if (optionsArg) {
    extend(options, optionsArg)
  }
  if (agentOptions) {
    options.agentOptions = agentOptions
  }

  options.forever = true
  return request.defaults(options)
}

// Exports

module.exports = request
request.Request = require('./request')
request.initParams = initParams

// Backwards compatibility for request.debug
Object.defineProperty(request, 'debug', {
  enumerable : true,
  get : function() {
    return request.Request.debug
  },
  set : function(debug) {
    request.Request.debug = debug
  }
})

},{"./lib/cookies":9,"./lib/helpers":12,"./request":111,"extend":33}],8:[function(require,module,exports){
'use strict'

var caseless = require('caseless')
  , uuid = require('node-uuid')
  , helpers = require('./helpers')

var md5 = helpers.md5
  , toBase64 = helpers.toBase64


function Auth (request) {
  // define all public properties here
  this.request = request
  this.hasAuth = false
  this.sentAuth = false
  this.bearerToken = null
  this.user = null
  this.pass = null
}

Auth.prototype.basic = function (user, pass, sendImmediately) {
  var self = this
  if (typeof user !== 'string' || (pass !== undefined && typeof pass !== 'string')) {
    self.request.emit('error', new Error('auth() received invalid user or password'))
  }
  self.user = user
  self.pass = pass
  self.hasAuth = true
  var header = user + ':' + (pass || '')
  if (sendImmediately || typeof sendImmediately === 'undefined') {
    var authHeader = 'Basic ' + toBase64(header)
    self.sentAuth = true
    return authHeader
  }
}

Auth.prototype.bearer = function (bearer, sendImmediately) {
  var self = this
  self.bearerToken = bearer
  self.hasAuth = true
  if (sendImmediately || typeof sendImmediately === 'undefined') {
    if (typeof bearer === 'function') {
      bearer = bearer()
    }
    var authHeader = 'Bearer ' + (bearer || '')
    self.sentAuth = true
    return authHeader
  }
}

Auth.prototype.digest = function (method, path, authHeader) {
  // TODO: More complete implementation of RFC 2617.
  //   - check challenge.algorithm
  //   - support algorithm="MD5-sess"
  //   - handle challenge.domain
  //   - support qop="auth-int" only
  //   - handle Authentication-Info (not necessarily?)
  //   - check challenge.stale (not necessarily?)
  //   - increase nc (not necessarily?)
  // For reference:
  // http://tools.ietf.org/html/rfc2617#section-3
  // https://github.com/bagder/curl/blob/master/lib/http_digest.c

  var self = this

  var challenge = {}
  var re = /([a-z0-9_-]+)=(?:"([^"]+)"|([a-z0-9_-]+))/gi
  for (;;) {
    var match = re.exec(authHeader)
    if (!match) {
      break
    }
    challenge[match[1]] = match[2] || match[3]
  }

  var ha1 = md5(self.user + ':' + challenge.realm + ':' + self.pass)
  var ha2 = md5(method + ':' + path)
  var qop = /(^|,)\s*auth\s*($|,)/.test(challenge.qop) && 'auth'
  var nc = qop && '00000001'
  var cnonce = qop && uuid().replace(/-/g, '')
  var digestResponse = qop
    ? md5(ha1 + ':' + challenge.nonce + ':' + nc + ':' + cnonce + ':' + qop + ':' + ha2)
    : md5(ha1 + ':' + challenge.nonce + ':' + ha2)
  var authValues = {
    username: self.user,
    realm: challenge.realm,
    nonce: challenge.nonce,
    uri: path,
    qop: qop,
    response: digestResponse,
    nc: nc,
    cnonce: cnonce,
    algorithm: challenge.algorithm,
    opaque: challenge.opaque
  }

  authHeader = []
  for (var k in authValues) {
    if (authValues[k]) {
      if (k === 'qop' || k === 'nc' || k === 'algorithm') {
        authHeader.push(k + '=' + authValues[k])
      } else {
        authHeader.push(k + '="' + authValues[k] + '"')
      }
    }
  }
  authHeader = 'Digest ' + authHeader.join(', ')
  self.sentAuth = true
  return authHeader
}

Auth.prototype.onRequest = function (user, pass, sendImmediately, bearer) {
  var self = this
    , request = self.request

  var authHeader
  if (bearer === undefined && user === undefined) {
    self.request.emit('error', new Error('no auth mechanism defined'))
  } else if (bearer !== undefined) {
    authHeader = self.bearer(bearer, sendImmediately)
  } else {
    authHeader = self.basic(user, pass, sendImmediately)
  }
  if (authHeader) {
    request.setHeader('authorization', authHeader)
  }
}

Auth.prototype.onResponse = function (response) {
  var self = this
    , request = self.request

  if (!self.hasAuth || self.sentAuth) { return null }

  var c = caseless(response.headers)

  var authHeader = c.get('www-authenticate')
  var authVerb = authHeader && authHeader.split(' ')[0].toLowerCase()
  request.debug('reauth', authVerb)

  switch (authVerb) {
    case 'basic':
      return self.basic(self.user, self.pass, true)

    case 'bearer':
      return self.bearer(self.bearerToken, true)

    case 'digest':
      return self.digest(request.method, request.path, authHeader)
  }
}

exports.Auth = Auth

},{"./helpers":12,"caseless":30,"node-uuid":96}],9:[function(require,module,exports){
'use strict'

var tough = require('tough-cookie')

var Cookie = tough.Cookie
  , CookieJar = tough.CookieJar


exports.parse = function(str) {
  if (str && str.uri) {
    str = str.uri
  }
  if (typeof str !== 'string') {
    throw new Error('The cookie function only accepts STRING as param')
  }
  return Cookie.parse(str)
}

// Adapt the sometimes-Async api of tough.CookieJar to our requirements
function RequestJar(store) {
  var self = this
  self._jar = new CookieJar(store)
}
RequestJar.prototype.setCookie = function(cookieOrStr, uri, options) {
  var self = this
  return self._jar.setCookieSync(cookieOrStr, uri, options || {})
}
RequestJar.prototype.getCookieString = function(uri) {
  var self = this
  return self._jar.getCookieStringSync(uri)
}
RequestJar.prototype.getCookies = function(uri) {
  var self = this
  return self._jar.getCookiesSync(uri)
}

exports.jar = function(store) {
  return new RequestJar(store)
}

},{"tough-cookie":103}],10:[function(require,module,exports){
'use strict'

function formatHostname(hostname) {
  // canonicalize the hostname, so that 'oogle.com' won't match 'google.com'
  return hostname.replace(/^\.*/, '.').toLowerCase()
}

function parseNoProxyZone(zone) {
  zone = zone.trim().toLowerCase()

  var zoneParts = zone.split(':', 2)
    , zoneHost = formatHostname(zoneParts[0])
    , zonePort = zoneParts[1]
    , hasPort = zone.indexOf(':') > -1

  return {hostname: zoneHost, port: zonePort, hasPort: hasPort}
}

function uriInNoProxy(uri, noProxy) {
  var port = uri.port || (uri.protocol === 'https:' ? '443' : '80')
    , hostname = formatHostname(uri.hostname)
    , noProxyList = noProxy.split(',')

  // iterate through the noProxyList until it finds a match.
  return noProxyList.map(parseNoProxyZone).some(function(noProxyZone) {
    var isMatchedAt = hostname.indexOf(noProxyZone.hostname)
      , hostnameMatched = (
          isMatchedAt > -1 &&
          (isMatchedAt === hostname.length - noProxyZone.hostname.length)
        )

    if (noProxyZone.hasPort) {
      return (port === noProxyZone.port) && hostnameMatched
    }

    return hostnameMatched
  })
}

function getProxyFromURI(uri) {
  // Decide the proper request proxy to use based on the request URI object and the
  // environmental variables (NO_PROXY, HTTP_PROXY, etc.)
  // respect NO_PROXY environment variables (see: http://lynx.isc.org/current/breakout/lynx_help/keystrokes/environments.html)

  var noProxy = process.env.NO_PROXY || process.env.no_proxy || ''

  // if the noProxy is a wildcard then return null

  if (noProxy === '*') {
    return null
  }

  // if the noProxy is not empty and the uri is found return null

  if (noProxy !== '' && uriInNoProxy(uri, noProxy)) {
    return null
  }

  // Check for HTTP or HTTPS Proxy in environment Else default to null

  if (uri.protocol === 'http:') {
    return process.env.HTTP_PROXY ||
           process.env.http_proxy || null
  }

  if (uri.protocol === 'https:') {
    return process.env.HTTPS_PROXY ||
           process.env.https_proxy ||
           process.env.HTTP_PROXY  ||
           process.env.http_proxy  || null
  }

  // if none of that works, return null
  // (What uri protocol are you using then?)

  return null
}

module.exports = getProxyFromURI

},{}],11:[function(require,module,exports){
'use strict'

var fs = require('fs')
var qs = require('querystring')
var validate = require('har-validator')
var util = require('util')

function Har (request) {
  this.request = request
}

Har.prototype.reducer = function (obj, pair) {
  // new property ?
  if (obj[pair.name] === undefined) {
    obj[pair.name] = pair.value
    return obj
  }

  // existing? convert to array
  var arr = [
    obj[pair.name],
    pair.value
  ]

  obj[pair.name] = arr

  return obj
}

Har.prototype.prep = function (data) {
  // construct utility properties
  data.queryObj = {}
  data.headersObj = {}
  data.postData.jsonObj = false
  data.postData.paramsObj = false

  // construct query objects
  if (data.queryString && data.queryString.length) {
    data.queryObj = data.queryString.reduce(this.reducer, {})
  }

  // construct headers objects
  if (data.headers && data.headers.length) {
    // loweCase header keys
    data.headersObj = data.headers.reduceRight(function (headers, header) {
      headers[header.name] = header.value
      return headers
    }, {})
  }

  // construct Cookie header
  if (data.cookies && data.cookies.length) {
    var cookies = data.cookies.map(function (cookie) {
      return cookie.name + '=' + cookie.value
    })

    if (cookies.length) {
      data.headersObj.cookie = cookies.join('; ')
    }
  }

  // prep body
  switch (data.postData.mimeType) {
    case 'multipart/mixed':
    case 'multipart/related':
    case 'multipart/form-data':
    case 'multipart/alternative':
      // reset values
      data.postData.mimeType = 'multipart/form-data'
      break

    case 'application/x-www-form-urlencoded':
      if (!data.postData.params) {
        data.postData.text = ''
      } else {
        data.postData.paramsObj = data.postData.params.reduce(this.reducer, {})

        // always overwrite
        data.postData.text = qs.stringify(data.postData.paramsObj)
      }
      break

    case 'text/json':
    case 'text/x-json':
    case 'application/json':
    case 'application/x-json':
      data.postData.mimeType = 'application/json'

      if (data.postData.text) {
        try {
          data.postData.jsonObj = JSON.parse(data.postData.text)
        } catch (e) {
          this.request.debug(e)

          // force back to text/plain
          data.postData.mimeType = 'text/plain'
        }
      }
      break
  }

  return data
}

Har.prototype.options = function (options) {
  // skip if no har property defined
  if (!options.har) {
    return options
  }

  var har = util._extend({}, options.har)

  // only process the first entry
  if (har.log && har.log.entries) {
    har = har.log.entries[0]
  }

  // add optional properties to make validation successful
  har.url = har.url || options.url || options.uri || options.baseUrl || '/'
  har.httpVersion = har.httpVersion || 'HTTP/1.1'
  har.queryString = har.queryString || []
  har.headers = har.headers || []
  har.cookies = har.cookies || []
  har.postData = har.postData || {}
  har.postData.mimeType = har.postData.mimeType || 'application/octet-stream'

  har.bodySize = 0
  har.headersSize = 0
  har.postData.size = 0

  if (!validate.request(har)) {
    return options
  }

  // clean up and get some utility properties
  var req = this.prep(har)

  // construct new options
  if (req.url) {
    options.url = req.url
  }

  if (req.method) {
    options.method = req.method
  }

  if (Object.keys(req.queryObj).length) {
    options.qs = req.queryObj
  }

  if (Object.keys(req.headersObj).length) {
    options.headers = req.headersObj
  }

  switch (req.postData.mimeType) {
    case 'application/x-www-form-urlencoded':
      options.form = req.postData.paramsObj
      break

    case 'application/json':
      if (req.postData.jsonObj) {
        options.body = req.postData.jsonObj
        options.json = true
      }
      break

    case 'multipart/form-data':
      options.formData = {}

      req.postData.params.forEach(function (param) {
        var attachment = {}

        if (!param.fileName && !param.fileName && !param.contentType) {
          options.formData[param.name] = param.value
          return
        }

        // attempt to read from disk!
        if (param.fileName && !param.value) {
          attachment.value = fs.createReadStream(param.fileName)
        } else if (param.value) {
          attachment.value = param.value
        }

        if (param.fileName) {
          attachment.options = {
            filename: param.fileName,
            contentType: param.contentType ? param.contentType : null
          }
        }

        options.formData[param.name] = attachment
      })
      break

    default:
      if (req.postData.text) {
        options.body = req.postData.text
      }
  }

  return options
}

exports.Har = Har

},{"fs":undefined,"har-validator":38,"querystring":undefined,"util":undefined}],12:[function(require,module,exports){
'use strict'

var jsonSafeStringify = require('json-stringify-safe')
  , crypto = require('crypto')

function deferMethod() {
  if (typeof setImmediate === 'undefined') {
    return process.nextTick
  }

  return setImmediate
}

function isFunction(value) {
  return typeof value === 'function'
}

function paramsHaveRequestBody(params) {
  return (
    params.body ||
    params.requestBodyStream ||
    (params.json && typeof params.json !== 'boolean') ||
    params.multipart
  )
}

function safeStringify (obj) {
  var ret
  try {
    ret = JSON.stringify(obj)
  } catch (e) {
    ret = jsonSafeStringify(obj)
  }
  return ret
}

function md5 (str) {
  return crypto.createHash('md5').update(str).digest('hex')
}

function isReadStream (rs) {
  return rs.readable && rs.path && rs.mode
}

function toBase64 (str) {
  return (new Buffer(str || '', 'utf8')).toString('base64')
}

function copy (obj) {
  var o = {}
  Object.keys(obj).forEach(function (i) {
    o[i] = obj[i]
  })
  return o
}

function version () {
  var numbers = process.version.replace('v', '').split('.')
  return {
    major: parseInt(numbers[0], 10),
    minor: parseInt(numbers[1], 10),
    patch: parseInt(numbers[2], 10)
  }
}

exports.isFunction            = isFunction
exports.paramsHaveRequestBody = paramsHaveRequestBody
exports.safeStringify         = safeStringify
exports.md5                   = md5
exports.isReadStream          = isReadStream
exports.toBase64              = toBase64
exports.copy                  = copy
exports.version               = version
exports.defer                 = deferMethod()

},{"crypto":undefined,"json-stringify-safe":92}],13:[function(require,module,exports){
'use strict'

var uuid = require('node-uuid')
  , CombinedStream = require('combined-stream')
  , isstream = require('isstream')


function Multipart (request) {
  this.request = request
  this.boundary = uuid()
  this.chunked = false
  this.body = null
}

Multipart.prototype.isChunked = function (options) {
  var self = this
    , chunked = false
    , parts = options.data || options

  if (!parts.forEach) {
    self.request.emit('error', new Error('Argument error, options.multipart.'))
  }

  if (options.chunked !== undefined) {
    chunked = options.chunked
  }

  if (self.request.getHeader('transfer-encoding') === 'chunked') {
    chunked = true
  }

  if (!chunked) {
    parts.forEach(function (part) {
      if (typeof part.body === 'undefined') {
        self.request.emit('error', new Error('Body attribute missing in multipart.'))
      }
      if (isstream(part.body)) {
        chunked = true
      }
    })
  }

  return chunked
}

Multipart.prototype.setHeaders = function (chunked) {
  var self = this

  if (chunked && !self.request.hasHeader('transfer-encoding')) {
    self.request.setHeader('transfer-encoding', 'chunked')
  }

  var header = self.request.getHeader('content-type')

  if (!header || header.indexOf('multipart') === -1) {
    self.request.setHeader('content-type', 'multipart/related; boundary=' + self.boundary)
  } else {
    if (header.indexOf('boundary') !== -1) {
      self.boundary = header.replace(/.*boundary=([^\s;]+).*/, '$1')
    } else {
      self.request.setHeader('content-type', header + '; boundary=' + self.boundary)
    }
  }
}

Multipart.prototype.build = function (parts, chunked) {
  var self = this
  var body = chunked ? new CombinedStream() : []

  function add (part) {
    return chunked ? body.append(part) : body.push(new Buffer(part))
  }

  if (self.request.preambleCRLF) {
    add('\r\n')
  }

  parts.forEach(function (part) {
    var preamble = '--' + self.boundary + '\r\n'
    Object.keys(part).forEach(function (key) {
      if (key === 'body') { return }
      preamble += key + ': ' + part[key] + '\r\n'
    })
    preamble += '\r\n'
    add(preamble)
    add(part.body)
    add('\r\n')
  })
  add('--' + self.boundary + '--')

  if (self.request.postambleCRLF) {
    add('\r\n')
  }

  return body
}

Multipart.prototype.onRequest = function (options) {
  var self = this

  var chunked = self.isChunked(options)
    , parts = options.data || options

  self.setHeaders(chunked)
  self.chunked = chunked
  self.body = self.build(parts, chunked)
}

exports.Multipart = Multipart

},{"combined-stream":31,"isstream":91,"node-uuid":96}],14:[function(require,module,exports){
'use strict'

var url = require('url')
  , qs = require('qs')
  , caseless = require('caseless')
  , uuid = require('node-uuid')
  , oauth = require('oauth-sign')
  , crypto = require('crypto')


function OAuth (request) {
  this.request = request
  this.params = null
}

OAuth.prototype.buildParams = function (_oauth, uri, method, query, form, qsLib) {
  var oa = {}
  for (var i in _oauth) {
    oa['oauth_' + i] = _oauth[i]
  }
  if (!oa.oauth_version) {
    oa.oauth_version = '1.0'
  }
  if (!oa.oauth_timestamp) {
    oa.oauth_timestamp = Math.floor( Date.now() / 1000 ).toString()
  }
  if (!oa.oauth_nonce) {
    oa.oauth_nonce = uuid().replace(/-/g, '')
  }
  if (!oa.oauth_signature_method) {
    oa.oauth_signature_method = 'HMAC-SHA1'
  }

  var consumer_secret_or_private_key = oa.oauth_consumer_secret || oa.oauth_private_key
  delete oa.oauth_consumer_secret
  delete oa.oauth_private_key

  var token_secret = oa.oauth_token_secret
  delete oa.oauth_token_secret

  var realm = oa.oauth_realm
  delete oa.oauth_realm
  delete oa.oauth_transport_method

  var baseurl = uri.protocol + '//' + uri.host + uri.pathname
  var params = qsLib.parse([].concat(query, form, qsLib.stringify(oa)).join('&'))

  oa.oauth_signature = oauth.sign(
    oa.oauth_signature_method,
    method,
    baseurl,
    params,
    consumer_secret_or_private_key,
    token_secret)

  if (realm) {
    oa.realm = realm
  }

  return oa
}

OAuth.prototype.buildBodyHash = function(_oauth, body) {
  if (['HMAC-SHA1', 'RSA-SHA1'].indexOf(_oauth.signature_method || 'HMAC-SHA1') < 0) {
    this.request.emit('error', new Error('oauth: ' + _oauth.signature_method +
      ' signature_method not supported with body_hash signing.'))
  }

  var shasum = crypto.createHash('sha1')
  shasum.update(body || '')
  var sha1 = shasum.digest('hex')

  return new Buffer(sha1).toString('base64')
}

OAuth.prototype.concatParams = function (oa, sep, wrap) {
  wrap = wrap || ''

  var params = Object.keys(oa).filter(function (i) {
    return i !== 'realm' && i !== 'oauth_signature'
  }).sort()

  if (oa.realm) {
    params.splice(0, 0, 'realm')
  }
  params.push('oauth_signature')

  return params.map(function (i) {
    return i + '=' + wrap + oauth.rfc3986(oa[i]) + wrap
  }).join(sep)
}

OAuth.prototype.onRequest = function (_oauth) {
  var self = this
  self.params = _oauth

  var uri = self.request.uri || {}
    , method = self.request.method || ''
    , headers = caseless(self.request.headers)
    , body = self.request.body || ''
    , qsLib = self.request.qsLib || qs

  var form
    , query
    , contentType = headers.get('content-type') || ''
    , formContentType = 'application/x-www-form-urlencoded'
    , transport = _oauth.transport_method || 'header'

  if (contentType.slice(0, formContentType.length) === formContentType) {
    contentType = formContentType
    form = body
  }
  if (uri.query) {
    query = uri.query
  }
  if (transport === 'body' && (method !== 'POST' || contentType !== formContentType)) {
    self.request.emit('error', new Error('oauth: transport_method of body requires POST ' +
      'and content-type ' + formContentType))
  }

  if (!form && typeof _oauth.body_hash === 'boolean') {
    _oauth.body_hash = self.buildBodyHash(_oauth, self.request.body.toString())
  }

  var oa = self.buildParams(_oauth, uri, method, query, form, qsLib)

  switch (transport) {
    case 'header':
      self.request.setHeader('Authorization', 'OAuth ' + self.concatParams(oa, ',', '"'))
      break

    case 'query':
      var href = self.request.uri.href += (query ? '&' : '?') + self.concatParams(oa, '&')
      self.request.uri = url.parse(href)
      self.request.path = self.request.uri.path
      break

    case 'body':
      self.request.body = (form ? form + '&' : '') + self.concatParams(oa, '&')
      break

    default:
      self.request.emit('error', new Error('oauth: transport_method invalid'))
  }
}

exports.OAuth = OAuth

},{"caseless":30,"crypto":undefined,"node-uuid":96,"oauth-sign":97,"qs":98,"url":undefined}],15:[function(require,module,exports){
'use strict'

var qs = require('qs')
  , querystring = require('querystring')


function Querystring (request) {
  this.request = request
  this.lib = null
  this.useQuerystring = null
  this.parseOptions = null
  this.stringifyOptions = null
}

Querystring.prototype.init = function (options) {
  if (this.lib) {return}

  this.useQuerystring = options.useQuerystring
  this.lib = (this.useQuerystring ? querystring : qs)

  this.parseOptions = options.qsParseOptions || {}
  this.stringifyOptions = options.qsStringifyOptions || {}
}

Querystring.prototype.stringify = function (obj) {
  return (this.useQuerystring)
    ? this.rfc3986(this.lib.stringify(obj,
      this.stringifyOptions.sep || null,
      this.stringifyOptions.eq || null,
      this.stringifyOptions))
    : this.lib.stringify(obj, this.stringifyOptions)
}

Querystring.prototype.parse = function (str) {
  return (this.useQuerystring)
    ? this.lib.parse(str,
      this.parseOptions.sep || null,
      this.parseOptions.eq || null,
      this.parseOptions)
    : this.lib.parse(str, this.parseOptions)
}

Querystring.prototype.rfc3986 = function (str) {
  return str.replace(/[!'()*]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase()
  })
}

Querystring.prototype.unescape = querystring.unescape

exports.Querystring = Querystring

},{"qs":98,"querystring":undefined}],16:[function(require,module,exports){
'use strict'

var url = require('url')
var isUrl = /^https?:/

function Redirect (request) {
  this.request = request
  this.followRedirect = true
  this.followRedirects = true
  this.followAllRedirects = false
  this.allowRedirect = function () {return true}
  this.maxRedirects = 10
  this.redirects = []
  this.redirectsFollowed = 0
  this.removeRefererHeader = false
}

Redirect.prototype.onRequest = function (options) {
  var self = this

  if (options.maxRedirects !== undefined) {
    self.maxRedirects = options.maxRedirects
  }
  if (typeof options.followRedirect === 'function') {
    self.allowRedirect = options.followRedirect
  }
  if (options.followRedirect !== undefined) {
    self.followRedirects = !!options.followRedirect
  }
  if (options.followAllRedirects !== undefined) {
    self.followAllRedirects = options.followAllRedirects
  }
  if (self.followRedirects || self.followAllRedirects) {
    self.redirects = self.redirects || []
  }
  if (options.removeRefererHeader !== undefined) {
    self.removeRefererHeader = options.removeRefererHeader
  }
}

Redirect.prototype.redirectTo = function (response) {
  var self = this
    , request = self.request

  var redirectTo = null
  if (response.statusCode >= 300 && response.statusCode < 400 && response.caseless.has('location')) {
    var location = response.caseless.get('location')
    request.debug('redirect', location)

    if (self.followAllRedirects) {
      redirectTo = location
    } else if (self.followRedirects) {
      switch (request.method) {
        case 'PATCH':
        case 'PUT':
        case 'POST':
        case 'DELETE':
          // Do not follow redirects
          break
        default:
          redirectTo = location
          break
      }
    }
  } else if (response.statusCode === 401) {
    var authHeader = request._auth.onResponse(response)
    if (authHeader) {
      request.setHeader('authorization', authHeader)
      redirectTo = request.uri
    }
  }
  return redirectTo
}

Redirect.prototype.onResponse = function (response) {
  var self = this
    , request = self.request

  var redirectTo = self.redirectTo(response)
  if (!redirectTo || !self.allowRedirect.call(request, response)) {
    return false
  }

  request.debug('redirect to', redirectTo)

  // ignore any potential response body.  it cannot possibly be useful
  // to us at this point.
  // response.resume should be defined, but check anyway before calling. Workaround for browserify.
  if (response.resume) {
    response.resume()
  }

  if (self.redirectsFollowed >= self.maxRedirects) {
    request.emit('error', new Error('Exceeded maxRedirects. Probably stuck in a redirect loop ' + request.uri.href))
    return false
  }
  self.redirectsFollowed += 1

  if (!isUrl.test(redirectTo)) {
    redirectTo = url.resolve(request.uri.href, redirectTo)
  }

  var uriPrev = request.uri
  request.uri = url.parse(redirectTo)

  // handle the case where we change protocol from https to http or vice versa
  if (request.uri.protocol !== uriPrev.protocol) {
    request._updateProtocol()
  }

  self.redirects.push(
    { statusCode : response.statusCode
    , redirectUri: redirectTo
    }
  )
  if (self.followAllRedirects && request.method !== 'HEAD'
    && response.statusCode !== 401 && response.statusCode !== 307) {
    request.method = 'GET'
  }
  // request.method = 'GET' // Force all redirects to use GET || commented out fixes #215
  delete request.src
  delete request.req
  delete request.agent
  delete request._started
  if (response.statusCode !== 401 && response.statusCode !== 307) {
    // Remove parameters from the previous response, unless this is the second request
    // for a server that requires digest authentication.
    delete request.body
    delete request._form
    if (request.headers) {
      request.removeHeader('host')
      request.removeHeader('content-type')
      request.removeHeader('content-length')
      if (request.uri.hostname !== request.originalHost.split(':')[0]) {
        // Remove authorization if changing hostnames (but not if just
        // changing ports or protocols).  This matches the behavior of curl:
        // https://github.com/bagder/curl/blob/6beb0eee/lib/http.c#L710
        request.removeHeader('authorization')
      }
    }
  }

  if (!self.removeRefererHeader) {
    request.setHeader('referer', request.uri.href)
  }

  request.emit('redirect')

  request.init()

  return true
}

exports.Redirect = Redirect

},{"url":undefined}],17:[function(require,module,exports){
'use strict'

var url = require('url')
  , tunnel = require('tunnel-agent')

var defaultProxyHeaderWhiteList = [
  'accept',
  'accept-charset',
  'accept-encoding',
  'accept-language',
  'accept-ranges',
  'cache-control',
  'content-encoding',
  'content-language',
  'content-length',
  'content-location',
  'content-md5',
  'content-range',
  'content-type',
  'connection',
  'date',
  'expect',
  'max-forwards',
  'pragma',
  'referer',
  'te',
  'transfer-encoding',
  'user-agent',
  'via'
]

var defaultProxyHeaderExclusiveList = [
  'proxy-authorization'
]

function constructProxyHost(uriObject) {
  var port = uriObject.portA
    , protocol = uriObject.protocol
    , proxyHost = uriObject.hostname + ':'

  if (port) {
    proxyHost += port
  } else if (protocol === 'https:') {
    proxyHost += '443'
  } else {
    proxyHost += '80'
  }

  return proxyHost
}

function constructProxyHeaderWhiteList(headers, proxyHeaderWhiteList) {
  var whiteList = proxyHeaderWhiteList
    .reduce(function (set, header) {
      set[header.toLowerCase()] = true
      return set
    }, {})

  return Object.keys(headers)
    .filter(function (header) {
      return whiteList[header.toLowerCase()]
    })
    .reduce(function (set, header) {
      set[header] = headers[header]
      return set
    }, {})
}

function constructTunnelOptions (request, proxyHeaders) {
  var proxy = request.proxy

  var tunnelOptions = {
    proxy : {
      host      : proxy.hostname,
      port      : +proxy.port,
      proxyAuth : proxy.auth,
      headers   : proxyHeaders
    },
    headers            : request.headers,
    ca                 : request.ca,
    cert               : request.cert,
    key                : request.key,
    passphrase         : request.passphrase,
    pfx                : request.pfx,
    ciphers            : request.ciphers,
    rejectUnauthorized : request.rejectUnauthorized,
    secureOptions      : request.secureOptions,
    secureProtocol     : request.secureProtocol
  }

  return tunnelOptions
}

function constructTunnelFnName(uri, proxy) {
  var uriProtocol = (uri.protocol === 'https:' ? 'https' : 'http')
  var proxyProtocol = (proxy.protocol === 'https:' ? 'Https' : 'Http')
  return [uriProtocol, proxyProtocol].join('Over')
}

function getTunnelFn(request) {
  var uri = request.uri
  var proxy = request.proxy
  var tunnelFnName = constructTunnelFnName(uri, proxy)
  return tunnel[tunnelFnName]
}


function Tunnel (request) {
  this.request = request
  this.proxyHeaderWhiteList = defaultProxyHeaderWhiteList
  this.proxyHeaderExclusiveList = []
}

Tunnel.prototype.isEnabled = function (options) {
  var request = this.request
  // Tunnel HTTPS by default, or if a previous request in the redirect chain
  // was tunneled.  Allow the user to override this setting.

  // If self.tunnel is already set (because this is a redirect), use the
  // existing value.
  if (typeof request.tunnel !== 'undefined') {
    return request.tunnel
  }

  // If options.tunnel is set (the user specified a value), use it.
  if (typeof options.tunnel !== 'undefined') {
    return options.tunnel
  }

  // If the destination is HTTPS, tunnel.
  if (request.uri.protocol === 'https:') {
    return true
  }

  // Otherwise, leave tunnel unset, because if a later request in the redirect
  // chain is HTTPS then that request (and any subsequent ones) should be
  // tunneled.
  return undefined
}

Tunnel.prototype.setup = function (options) {
  var self = this
    , request = self.request

  options = options || {}

  if (typeof request.proxy === 'string') {
    request.proxy = url.parse(request.proxy)
  }

  if (!request.proxy || !request.tunnel) {
    return false
  }

  // Setup Proxy Header Exclusive List and White List
  if (options.proxyHeaderWhiteList) {
    self.proxyHeaderWhiteList = options.proxyHeaderWhiteList
  }
  if (options.proxyHeaderExclusiveList) {
    self.proxyHeaderExclusiveList = options.proxyHeaderExclusiveList
  }

  var proxyHeaderExclusiveList = self.proxyHeaderExclusiveList.concat(defaultProxyHeaderExclusiveList)
  var proxyHeaderWhiteList = self.proxyHeaderWhiteList.concat(proxyHeaderExclusiveList)

  // Setup Proxy Headers and Proxy Headers Host
  // Only send the Proxy White Listed Header names
  var proxyHeaders = constructProxyHeaderWhiteList(request.headers, proxyHeaderWhiteList)
  proxyHeaders.host = constructProxyHost(request.uri)

  proxyHeaderExclusiveList.forEach(request.removeHeader, request)

  // Set Agent from Tunnel Data
  var tunnelFn = getTunnelFn(request)
  var tunnelOptions = constructTunnelOptions(request, proxyHeaders)
  request.agent = tunnelFn(tunnelOptions)

  return true
}

Tunnel.defaultProxyHeaderWhiteList = defaultProxyHeaderWhiteList
Tunnel.defaultProxyHeaderExclusiveList = defaultProxyHeaderExclusiveList
exports.Tunnel = Tunnel

},{"tunnel-agent":110,"url":undefined}],18:[function(require,module,exports){

/*!
 * knox - auth
 * Copyright(c) 2010 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var crypto = require('crypto')
  , parse = require('url').parse
  ;

/**
 * Valid keys.
 */

var keys = 
  [ 'acl'
  , 'location'
  , 'logging'
  , 'notification'
  , 'partNumber'
  , 'policy'
  , 'requestPayment'
  , 'torrent'
  , 'uploadId'
  , 'uploads'
  , 'versionId'
  , 'versioning'
  , 'versions'
  , 'website'
  ]

/**
 * Return an "Authorization" header value with the given `options`
 * in the form of "AWS <key>:<signature>"
 *
 * @param {Object} options
 * @return {String}
 * @api private
 */

function authorization (options) {
  return 'AWS ' + options.key + ':' + sign(options)
}

module.exports = authorization
module.exports.authorization = authorization

/**
 * Simple HMAC-SHA1 Wrapper
 *
 * @param {Object} options
 * @return {String}
 * @api private
 */ 

function hmacSha1 (options) {
  return crypto.createHmac('sha1', options.secret).update(options.message).digest('base64')
}

module.exports.hmacSha1 = hmacSha1

/**
 * Create a base64 sha1 HMAC for `options`. 
 * 
 * @param {Object} options
 * @return {String}
 * @api private
 */

function sign (options) {
  options.message = stringToSign(options)
  return hmacSha1(options)
}
module.exports.sign = sign

/**
 * Create a base64 sha1 HMAC for `options`. 
 *
 * Specifically to be used with S3 presigned URLs
 * 
 * @param {Object} options
 * @return {String}
 * @api private
 */

function signQuery (options) {
  options.message = queryStringToSign(options)
  return hmacSha1(options)
}
module.exports.signQuery= signQuery

/**
 * Return a string for sign() with the given `options`.
 *
 * Spec:
 * 
 *    <verb>\n
 *    <md5>\n
 *    <content-type>\n
 *    <date>\n
 *    [headers\n]
 *    <resource>
 *
 * @param {Object} options
 * @return {String}
 * @api private
 */

function stringToSign (options) {
  var headers = options.amazonHeaders || ''
  if (headers) headers += '\n'
  var r = 
    [ options.verb
    , options.md5
    , options.contentType
    , options.date ? options.date.toUTCString() : ''
    , headers + options.resource
    ]
  return r.join('\n')
}
module.exports.queryStringToSign = stringToSign

/**
 * Return a string for sign() with the given `options`, but is meant exclusively
 * for S3 presigned URLs
 *
 * Spec:
 * 
 *    <date>\n
 *    <resource>
 *
 * @param {Object} options
 * @return {String}
 * @api private
 */

function queryStringToSign (options){
  return 'GET\n\n\n' + options.date + '\n' + options.resource
}
module.exports.queryStringToSign = queryStringToSign

/**
 * Perform the following:
 *
 *  - ignore non-amazon headers
 *  - lowercase fields
 *  - sort lexicographically
 *  - trim whitespace between ":"
 *  - join with newline
 *
 * @param {Object} headers
 * @return {String}
 * @api private
 */

function canonicalizeHeaders (headers) {
  var buf = []
    , fields = Object.keys(headers)
    ;
  for (var i = 0, len = fields.length; i < len; ++i) {
    var field = fields[i]
      , val = headers[field]
      , field = field.toLowerCase()
      ;
    if (0 !== field.indexOf('x-amz')) continue
    buf.push(field + ':' + val)
  }
  return buf.sort().join('\n')
}
module.exports.canonicalizeHeaders = canonicalizeHeaders

/**
 * Perform the following:
 *
 *  - ignore non sub-resources
 *  - sort lexicographically
 *
 * @param {String} resource
 * @return {String}
 * @api private
 */

function canonicalizeResource (resource) {
  var url = parse(resource, true)
    , path = url.pathname
    , buf = []
    ;

  Object.keys(url.query).forEach(function(key){
    if (!~keys.indexOf(key)) return
    var val = '' == url.query[key] ? '' : '=' + encodeURIComponent(url.query[key])
    buf.push(key + val)
  })

  return path + (buf.length ? '?' + buf.sort().join('&') : '')
}
module.exports.canonicalizeResource = canonicalizeResource

},{"crypto":undefined,"url":undefined}],19:[function(require,module,exports){
var DuplexStream = require('readable-stream/duplex')
  , util         = require('util')

function BufferList (callback) {
  if (!(this instanceof BufferList))
    return new BufferList(callback)

  this._bufs  = []
  this.length = 0

  if (typeof callback == 'function') {
    this._callback = callback

    var piper = function (err) {
      if (this._callback) {
        this._callback(err)
        this._callback = null
      }
    }.bind(this)

    this.on('pipe', function (src) {
      src.on('error', piper)
    })
    this.on('unpipe', function (src) {
      src.removeListener('error', piper)
    })
  }
  else if (Buffer.isBuffer(callback))
    this.append(callback)
  else if (Array.isArray(callback)) {
    callback.forEach(function (b) {
      Buffer.isBuffer(b) && this.append(b)
    }.bind(this))
  }

  DuplexStream.call(this)
}

util.inherits(BufferList, DuplexStream)

BufferList.prototype._offset = function (offset) {
  var tot = 0, i = 0, _t
  for (; i < this._bufs.length; i++) {
    _t = tot + this._bufs[i].length
    if (offset < _t)
      return [ i, offset - tot ]
    tot = _t
  }
}

BufferList.prototype.append = function (buf) {
  var isBuffer = Buffer.isBuffer(buf) ||
                 buf instanceof BufferList

  this._bufs.push(isBuffer ? buf : new Buffer(buf))
  this.length += buf.length
  return this
}

BufferList.prototype._write = function (buf, encoding, callback) {
  this.append(buf)
  if (callback)
    callback()
}

BufferList.prototype._read = function (size) {
  if (!this.length)
    return this.push(null)
  size = Math.min(size, this.length)
  this.push(this.slice(0, size))
  this.consume(size)
}

BufferList.prototype.end = function (chunk) {
  DuplexStream.prototype.end.call(this, chunk)

  if (this._callback) {
    this._callback(null, this.slice())
    this._callback = null
  }
}

BufferList.prototype.get = function (index) {
  return this.slice(index, index + 1)[0]
}

BufferList.prototype.slice = function (start, end) {
  return this.copy(null, 0, start, end)
}

BufferList.prototype.copy = function (dst, dstStart, srcStart, srcEnd) {
  if (typeof srcStart != 'number' || srcStart < 0)
    srcStart = 0
  if (typeof srcEnd != 'number' || srcEnd > this.length)
    srcEnd = this.length
  if (srcStart >= this.length)
    return dst || new Buffer(0)
  if (srcEnd <= 0)
    return dst || new Buffer(0)

  var copy   = !!dst
    , off    = this._offset(srcStart)
    , len    = srcEnd - srcStart
    , bytes  = len
    , bufoff = (copy && dstStart) || 0
    , start  = off[1]
    , l
    , i

  // copy/slice everything
  if (srcStart === 0 && srcEnd == this.length) {
    if (!copy) // slice, just return a full concat
      return Buffer.concat(this._bufs)

    // copy, need to copy individual buffers
    for (i = 0; i < this._bufs.length; i++) {
      this._bufs[i].copy(dst, bufoff)
      bufoff += this._bufs[i].length
    }

    return dst
  }

  // easy, cheap case where it's a subset of one of the buffers
  if (bytes <= this._bufs[off[0]].length - start) {
    return copy
      ? this._bufs[off[0]].copy(dst, dstStart, start, start + bytes)
      : this._bufs[off[0]].slice(start, start + bytes)
  }

  if (!copy) // a slice, we need something to copy in to
    dst = new Buffer(len)

  for (i = off[0]; i < this._bufs.length; i++) {
    l = this._bufs[i].length - start

    if (bytes > l) {
      this._bufs[i].copy(dst, bufoff, start)
    } else {
      this._bufs[i].copy(dst, bufoff, start, start + bytes)
      break
    }

    bufoff += l
    bytes -= l

    if (start)
      start = 0
  }

  return dst
}

BufferList.prototype.toString = function (encoding, start, end) {
  return this.slice(start, end).toString(encoding)
}

BufferList.prototype.consume = function (bytes) {
  while (this._bufs.length) {
    if (bytes > this._bufs[0].length) {
      bytes -= this._bufs[0].length
      this.length -= this._bufs[0].length
      this._bufs.shift()
    } else {
      this._bufs[0] = this._bufs[0].slice(bytes)
      this.length -= bytes
      break
    }
  }
  return this
}

BufferList.prototype.duplicate = function () {
  var i = 0
    , copy = new BufferList()

  for (; i < this._bufs.length; i++)
    copy.append(this._bufs[i])

  return copy
}

BufferList.prototype.destroy = function () {
  this._bufs.length = 0;
  this.length = 0;
  this.push(null);
}

;(function () {
  var methods = {
      'readDoubleBE' : 8
    , 'readDoubleLE' : 8
    , 'readFloatBE'  : 4
    , 'readFloatLE'  : 4
    , 'readInt32BE'  : 4
    , 'readInt32LE'  : 4
    , 'readUInt32BE' : 4
    , 'readUInt32LE' : 4
    , 'readInt16BE'  : 2
    , 'readInt16LE'  : 2
    , 'readUInt16BE' : 2
    , 'readUInt16LE' : 2
    , 'readInt8'     : 1
    , 'readUInt8'    : 1
  }

  for (var m in methods) {
    (function (m) {
      BufferList.prototype[m] = function (offset) {
        return this.slice(offset, offset + methods[m])[m](0)
      }
    }(m))
  }
}())

module.exports = BufferList

},{"readable-stream/duplex":20,"util":undefined}],20:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":21}],21:[function(require,module,exports){
// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

'use strict';

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}
/*</replacement>*/


module.exports = Duplex;

/*<replacement>*/
var processNextTick = require('process-nextick-args');
/*</replacement>*/



/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

var keys = objectKeys(Writable.prototype);
for (var v = 0; v < keys.length; v++) {
  var method = keys[v];
  if (!Duplex.prototype[method])
    Duplex.prototype[method] = Writable.prototype[method];
}

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  processNextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

},{"./_stream_readable":22,"./_stream_writable":23,"core-util-is":24,"inherits":25,"process-nextick-args":27}],22:[function(require,module,exports){
'use strict';

module.exports = Readable;

/*<replacement>*/
var processNextTick = require('process-nextick-args');
/*</replacement>*/


/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/


/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;

/*<replacement>*/
if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/



/*<replacement>*/
var Stream;
(function (){try{
  Stream = require('st' + 'ream');
}catch(_){}finally{
  if (!Stream)
    Stream = require('events').EventEmitter;
}}())
/*</replacement>*/

var Buffer = require('buffer').Buffer;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/



/*<replacement>*/
var debug = require('util');
if (debug && debug.debuglog) {
  debug = debug.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/

var StringDecoder;

util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  var Duplex = require('./_stream_duplex');

  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options && typeof options.read === 'function')
    this._read = options.read;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (!state.objectMode && typeof chunk === 'string') {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

Readable.prototype.isPaused = function() {
  return this._readableState.flowing === false;
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      if (!addToFront)
        state.reading = false;

      // if we want the data now, just emit it.
      if (state.flowing && state.length === 0 && !state.sync) {
        stream.emit('data', chunk);
        stream.read(0);
      } else {
        // update the buffer info.
        state.length += state.objectMode ? 1 : chunk.length;
        if (addToFront)
          state.buffer.unshift(chunk);
        else
          state.buffer.push(chunk);

        if (state.needReadable)
          emitReadable(stream);
      }

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (n === null || isNaN(n)) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else {
      return state.length;
    }
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  debug('read', n);
  var state = this._readableState;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended)
      endReadable(this);
    else
      emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  }

  if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read pushed data synchronously, then `reading` will be false,
  // and we need to re-evaluate how much data we can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we tried to read() past the EOF, then emit end on the next tick.
  if (nOrig !== n && state.ended && state.length === 0)
    endReadable(this);

  if (ret !== null)
    this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!(Buffer.isBuffer(chunk)) &&
      typeof chunk !== 'string' &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync)
      processNextTick(emitReadable_, stream);
    else
      emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    processNextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    processNextTick(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain &&
        (!dest._writableState || dest._writableState.needDrain))
      ondrain();
  }

  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    if (false === ret) {
      debug('false write response, pause',
            src._readableState.awaitDrain);
      src._readableState.awaitDrain++;
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events || !dest._events.error)
    dest.on('error', onerror);
  else if (isArray(dest._events.error))
    dest._events.error.unshift(onerror);
  else
    dest._events.error = [onerror, dest._events.error];



  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain)
      state.awaitDrain--;
    if (state.awaitDrain === 0 && EE.listenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  // If listening to data, and it has not explicitly been paused,
  // then call resume to start the flow of data on the next tick.
  if (ev === 'data' && false !== this._readableState.flowing) {
    this.resume();
  }

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        processNextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    processNextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading)
    stream.read(0);
}

Readable.prototype.pause = function() {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  if (state.flowing) {
    do {
      var chunk = stream.read();
    } while (null !== chunk && state.flowing);
  }
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    debug('wrapped data');
    if (state.decoder)
      chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined))
      return;
    else if (!state.objectMode && (!chunk || !chunk.length))
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }; }(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    processNextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

},{"./_stream_duplex":21,"buffer":undefined,"core-util-is":24,"events":undefined,"inherits":25,"isarray":26,"process-nextick-args":27,"string_decoder/":28,"util":undefined}],23:[function(require,module,exports){
// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

'use strict';

module.exports = Writable;

/*<replacement>*/
var processNextTick = require('process-nextick-args');
/*</replacement>*/


/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Writable.WritableState = WritableState;


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/



/*<replacement>*/
var Stream;
(function (){try{
  Stream = require('st' + 'ream');
}catch(_){}finally{
  if (!Stream)
    Stream = require('events').EventEmitter;
}}())
/*</replacement>*/

var Buffer = require('buffer').Buffer;

util.inherits(Writable, Stream);

function nop() {}

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

function WritableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;
}

WritableState.prototype.getBuffer = function writableStateGetBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};

(function (){try {
Object.defineProperty(WritableState.prototype, 'buffer', {
  get: require('util-deprecate')(function() {
    return this.getBuffer();
  }, '_writableState.buffer is deprecated. Use ' +
      '_writableState.getBuffer() instead.')
});
}catch(_){}}());


function Writable(options) {
  var Duplex = require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function')
      this._write = options.write;

    if (typeof options.writev === 'function')
      this._writev = options.writev;
  }

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  processNextTick(cb, er);
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;

  if (!(Buffer.isBuffer(chunk)) &&
      typeof chunk !== 'string' &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    processNextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = nop;

  if (state.ended)
    writeAfterEnd(this, cb);
  else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function() {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function() {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing &&
        !state.corked &&
        !state.finished &&
        !state.bufferProcessing &&
        state.bufferedRequest)
      clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string')
    encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64',
'ucs2', 'ucs-2','utf16le', 'utf-16le', 'raw']
.indexOf((encoding + '').toLowerCase()) > -1))
    throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);

  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret)
    state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = new WriteReq(chunk, encoding, cb);
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev)
    stream._writev(chunk, state.onwrite);
  else
    stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;
  if (sync)
    processNextTick(cb, er);
  else
    cb(er);

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished &&
        !state.corked &&
        !state.bufferProcessing &&
        state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      processNextTick(afterWrite, stream, state, finished, cb);
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var buffer = [];
    var cbs = [];
    while (entry) {
      cbs.push(entry.callback);
      buffer.push(entry);
      entry = entry.next;
    }

    // count the one we are adding, as well.
    // TODO(isaacs) clean this up
    state.pendingcb++;
    state.lastBufferedRequest = null;
    doWrite(stream, state, true, state.length, buffer, '', function(err) {
      for (var i = 0; i < cbs.length; i++) {
        state.pendingcb--;
        cbs[i](err);
      }
    });

    // Clear buffer
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null)
      state.lastBufferedRequest = null;
  }
  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined)
    this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(state) {
  return (state.ending &&
          state.length === 0 &&
          state.bufferedRequest === null &&
          !state.finished &&
          !state.writing);
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else {
      prefinish(stream, state);
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      processNextTick(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

},{"./_stream_duplex":21,"buffer":undefined,"core-util-is":24,"events":undefined,"inherits":25,"process-nextick-args":27,"util-deprecate":29}],24:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

function isBuffer(arg) {
  return Buffer.isBuffer(arg);
}
exports.isBuffer = isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}
},{}],25:[function(require,module,exports){
module.exports = require('util').inherits

},{"util":undefined}],26:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],27:[function(require,module,exports){
'use strict';
module.exports = nextTick;

function nextTick(fn) {
  var args = new Array(arguments.length - 1);
  var i = 0;
  while (i < arguments.length) {
    args[i++] = arguments[i];
  }
  process.nextTick(function afterTick() {
    fn.apply(null, args);
  });
}

},{}],28:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     }


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
};


// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

},{"buffer":undefined}],29:[function(require,module,exports){

/**
 * For Node.js, simply re-export the core `util.deprecate` function.
 */

module.exports = require('util').deprecate;

},{"util":undefined}],30:[function(require,module,exports){
function Caseless (dict) {
  this.dict = dict || {}
}
Caseless.prototype.set = function (name, value, clobber) {
  if (typeof name === 'object') {
    for (var i in name) {
      this.set(i, name[i], value)
    }
  } else {
    if (typeof clobber === 'undefined') clobber = true
    var has = this.has(name)

    if (!clobber && has) this.dict[has] = this.dict[has] + ',' + value
    else this.dict[has || name] = value
    return has
  }
}
Caseless.prototype.has = function (name) {
  var keys = Object.keys(this.dict)
    , name = name.toLowerCase()
    ;
  for (var i=0;i<keys.length;i++) {
    if (keys[i].toLowerCase() === name) return keys[i]
  }
  return false
}
Caseless.prototype.get = function (name) {
  name = name.toLowerCase()
  var result, _key
  var headers = this.dict
  Object.keys(headers).forEach(function (key) {
    _key = key.toLowerCase()
    if (name === _key) result = headers[key]
  })
  return result
}
Caseless.prototype.swap = function (name) {
  var has = this.has(name)
  if (!has) throw new Error('There is no header than matches "'+name+'"')
  this.dict[name] = this.dict[has]
  delete this.dict[has]
}
Caseless.prototype.del = function (name) {
  var has = this.has(name)
  return delete this.dict[has || name]
}

module.exports = function (dict) {return new Caseless(dict)}
module.exports.httpify = function (resp, headers) {
  var c = new Caseless(headers)
  resp.setHeader = function (key, value, clobber) {
    if (typeof value === 'undefined') return
    return c.set(key, value, clobber)
  }
  resp.hasHeader = function (key) {
    return c.has(key)
  }
  resp.getHeader = function (key) {
    return c.get(key)
  }
  resp.removeHeader = function (key) {
    return c.del(key)
  }
  resp.headers = c.dict
  return c
}

},{}],31:[function(require,module,exports){
var util = require('util');
var Stream = require('stream').Stream;
var DelayedStream = require('delayed-stream');

module.exports = CombinedStream;
function CombinedStream() {
  this.writable = false;
  this.readable = true;
  this.dataSize = 0;
  this.maxDataSize = 2 * 1024 * 1024;
  this.pauseStreams = true;

  this._released = false;
  this._streams = [];
  this._currentStream = null;
}
util.inherits(CombinedStream, Stream);

CombinedStream.create = function(options) {
  var combinedStream = new this();

  options = options || {};
  for (var option in options) {
    combinedStream[option] = options[option];
  }

  return combinedStream;
};

CombinedStream.isStreamLike = function(stream) {
  return (typeof stream !== 'function')
    && (typeof stream !== 'string')
    && (typeof stream !== 'boolean')
    && (typeof stream !== 'number')
    && (!Buffer.isBuffer(stream));
};

CombinedStream.prototype.append = function(stream) {
  var isStreamLike = CombinedStream.isStreamLike(stream);

  if (isStreamLike) {
    if (!(stream instanceof DelayedStream)) {
      var newStream = DelayedStream.create(stream, {
        maxDataSize: Infinity,
        pauseStream: this.pauseStreams,
      });
      stream.on('data', this._checkDataSize.bind(this));
      stream = newStream;
    }

    this._handleErrors(stream);

    if (this.pauseStreams) {
      stream.pause();
    }
  }

  this._streams.push(stream);
  return this;
};

CombinedStream.prototype.pipe = function(dest, options) {
  Stream.prototype.pipe.call(this, dest, options);
  this.resume();
  return dest;
};

CombinedStream.prototype._getNext = function() {
  this._currentStream = null;
  var stream = this._streams.shift();


  if (typeof stream == 'undefined') {
    this.end();
    return;
  }

  if (typeof stream !== 'function') {
    this._pipeNext(stream);
    return;
  }

  var getStream = stream;
  getStream(function(stream) {
    var isStreamLike = CombinedStream.isStreamLike(stream);
    if (isStreamLike) {
      stream.on('data', this._checkDataSize.bind(this));
      this._handleErrors(stream);
    }

    this._pipeNext(stream);
  }.bind(this));
};

CombinedStream.prototype._pipeNext = function(stream) {
  this._currentStream = stream;

  var isStreamLike = CombinedStream.isStreamLike(stream);
  if (isStreamLike) {
    stream.on('end', this._getNext.bind(this));
    stream.pipe(this, {end: false});
    return;
  }

  var value = stream;
  this.write(value);
  this._getNext();
};

CombinedStream.prototype._handleErrors = function(stream) {
  var self = this;
  stream.on('error', function(err) {
    self._emitError(err);
  });
};

CombinedStream.prototype.write = function(data) {
  this.emit('data', data);
};

CombinedStream.prototype.pause = function() {
  if (!this.pauseStreams) {
    return;
  }

  if(this.pauseStreams && this._currentStream && typeof(this._currentStream.pause) == 'function') this._currentStream.pause();
  this.emit('pause');
};

CombinedStream.prototype.resume = function() {
  if (!this._released) {
    this._released = true;
    this.writable = true;
    this._getNext();
  }

  if(this.pauseStreams && this._currentStream && typeof(this._currentStream.resume) == 'function') this._currentStream.resume();
  this.emit('resume');
};

CombinedStream.prototype.end = function() {
  this._reset();
  this.emit('end');
};

CombinedStream.prototype.destroy = function() {
  this._reset();
  this.emit('close');
};

CombinedStream.prototype._reset = function() {
  this.writable = false;
  this._streams = [];
  this._currentStream = null;
};

CombinedStream.prototype._checkDataSize = function() {
  this._updateDataSize();
  if (this.dataSize <= this.maxDataSize) {
    return;
  }

  var message =
    'DelayedStream#maxDataSize of ' + this.maxDataSize + ' bytes exceeded.';
  this._emitError(new Error(message));
};

CombinedStream.prototype._updateDataSize = function() {
  this.dataSize = 0;

  var self = this;
  this._streams.forEach(function(stream) {
    if (!stream.dataSize) {
      return;
    }

    self.dataSize += stream.dataSize;
  });

  if (this._currentStream && this._currentStream.dataSize) {
    this.dataSize += this._currentStream.dataSize;
  }
};

CombinedStream.prototype._emitError = function(err) {
  this._reset();
  this.emit('error', err);
};

},{"delayed-stream":32,"stream":undefined,"util":undefined}],32:[function(require,module,exports){
var Stream = require('stream').Stream;
var util = require('util');

module.exports = DelayedStream;
function DelayedStream() {
  this.source = null;
  this.dataSize = 0;
  this.maxDataSize = 1024 * 1024;
  this.pauseStream = true;

  this._maxDataSizeExceeded = false;
  this._released = false;
  this._bufferedEvents = [];
}
util.inherits(DelayedStream, Stream);

DelayedStream.create = function(source, options) {
  var delayedStream = new this();

  options = options || {};
  for (var option in options) {
    delayedStream[option] = options[option];
  }

  delayedStream.source = source;

  var realEmit = source.emit;
  source.emit = function() {
    delayedStream._handleEmit(arguments);
    return realEmit.apply(source, arguments);
  };

  source.on('error', function() {});
  if (delayedStream.pauseStream) {
    source.pause();
  }

  return delayedStream;
};

Object.defineProperty(DelayedStream.prototype, 'readable', {
  configurable: true,
  enumerable: true,
  get: function() {
    return this.source.readable;
  }
});

DelayedStream.prototype.setEncoding = function() {
  return this.source.setEncoding.apply(this.source, arguments);
};

DelayedStream.prototype.resume = function() {
  if (!this._released) {
    this.release();
  }

  this.source.resume();
};

DelayedStream.prototype.pause = function() {
  this.source.pause();
};

DelayedStream.prototype.release = function() {
  this._released = true;

  this._bufferedEvents.forEach(function(args) {
    this.emit.apply(this, args);
  }.bind(this));
  this._bufferedEvents = [];
};

DelayedStream.prototype.pipe = function() {
  var r = Stream.prototype.pipe.apply(this, arguments);
  this.resume();
  return r;
};

DelayedStream.prototype._handleEmit = function(args) {
  if (this._released) {
    this.emit.apply(this, args);
    return;
  }

  if (args[0] === 'data') {
    this.dataSize += args[1].length;
    this._checkIfMaxDataSizeExceeded();
  }

  this._bufferedEvents.push(args);
};

DelayedStream.prototype._checkIfMaxDataSizeExceeded = function() {
  if (this._maxDataSizeExceeded) {
    return;
  }

  if (this.dataSize <= this.maxDataSize) {
    return;
  }

  this._maxDataSizeExceeded = true;
  var message =
    'DelayedStream#maxDataSize of ' + this.maxDataSize + ' bytes exceeded.'
  this.emit('error', new Error(message));
};

},{"stream":undefined,"util":undefined}],33:[function(require,module,exports){
'use strict';

var hasOwn = Object.prototype.hasOwnProperty;
var toStr = Object.prototype.toString;

var isArray = function isArray(arr) {
	if (typeof Array.isArray === 'function') {
		return Array.isArray(arr);
	}

	return toStr.call(arr) === '[object Array]';
};

var isPlainObject = function isPlainObject(obj) {
	if (!obj || toStr.call(obj) !== '[object Object]') {
		return false;
	}

	var hasOwnConstructor = hasOwn.call(obj, 'constructor');
	var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.
	var key;
	for (key in obj) {/**/}

	return typeof key === 'undefined' || hasOwn.call(obj, key);
};

module.exports = function extend() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0],
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if (typeof target === 'boolean') {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	} else if ((typeof target !== 'object' && typeof target !== 'function') || target == null) {
		target = {};
	}

	for (; i < length; ++i) {
		options = arguments[i];
		// Only deal with non-null/undefined values
		if (options != null) {
			// Extend the base object
			for (name in options) {
				src = target[name];
				copy = options[name];

				// Prevent never-ending loop
				if (target !== copy) {
					// Recurse if we're merging plain objects or arrays
					if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
						if (copyIsArray) {
							copyIsArray = false;
							clone = src && isArray(src) ? src : [];
						} else {
							clone = src && isPlainObject(src) ? src : {};
						}

						// Never move original objects, clone them
						target[name] = extend(deep, clone, copy);

					// Don't bring in undefined values
					} else if (typeof copy !== 'undefined') {
						target[name] = copy;
					}
				}
			}
		}
	}

	// Return the modified object
	return target;
};


},{}],34:[function(require,module,exports){
module.exports = ForeverAgent
ForeverAgent.SSL = ForeverAgentSSL

var util = require('util')
  , Agent = require('http').Agent
  , net = require('net')
  , tls = require('tls')
  , AgentSSL = require('https').Agent
  
function getConnectionName(host, port) {  
  var name = ''
  if (typeof host === 'string') {
    name = host + ':' + port
  } else {
    // For node.js v012.0 and iojs-v1.5.1, host is an object. And any existing localAddress is part of the connection name.
    name = host.host + ':' + host.port + ':' + (host.localAddress ? (host.localAddress + ':') : ':')
  }
  return name
}    

function ForeverAgent(options) {
  var self = this
  self.options = options || {}
  self.requests = {}
  self.sockets = {}
  self.freeSockets = {}
  self.maxSockets = self.options.maxSockets || Agent.defaultMaxSockets
  self.minSockets = self.options.minSockets || ForeverAgent.defaultMinSockets
  self.on('free', function(socket, host, port) {
    var name = getConnectionName(host, port)

    if (self.requests[name] && self.requests[name].length) {
      self.requests[name].shift().onSocket(socket)
    } else if (self.sockets[name].length < self.minSockets) {
      if (!self.freeSockets[name]) self.freeSockets[name] = []
      self.freeSockets[name].push(socket)
      
      // if an error happens while we don't use the socket anyway, meh, throw the socket away
      var onIdleError = function() {
        socket.destroy()
      }
      socket._onIdleError = onIdleError
      socket.on('error', onIdleError)
    } else {
      // If there are no pending requests just destroy the
      // socket and it will get removed from the pool. This
      // gets us out of timeout issues and allows us to
      // default to Connection:keep-alive.
      socket.destroy()
    }
  })

}
util.inherits(ForeverAgent, Agent)

ForeverAgent.defaultMinSockets = 5


ForeverAgent.prototype.createConnection = net.createConnection
ForeverAgent.prototype.addRequestNoreuse = Agent.prototype.addRequest
ForeverAgent.prototype.addRequest = function(req, host, port) {
  var name = getConnectionName(host, port)
  
  if (typeof host !== 'string') {
    var options = host
    port = options.port
    host = options.host
  }

  if (this.freeSockets[name] && this.freeSockets[name].length > 0 && !req.useChunkedEncodingByDefault) {
    var idleSocket = this.freeSockets[name].pop()
    idleSocket.removeListener('error', idleSocket._onIdleError)
    delete idleSocket._onIdleError
    req._reusedSocket = true
    req.onSocket(idleSocket)
  } else {
    this.addRequestNoreuse(req, host, port)
  }
}

ForeverAgent.prototype.removeSocket = function(s, name, host, port) {
  if (this.sockets[name]) {
    var index = this.sockets[name].indexOf(s)
    if (index !== -1) {
      this.sockets[name].splice(index, 1)
    }
  } else if (this.sockets[name] && this.sockets[name].length === 0) {
    // don't leak
    delete this.sockets[name]
    delete this.requests[name]
  }
  
  if (this.freeSockets[name]) {
    var index = this.freeSockets[name].indexOf(s)
    if (index !== -1) {
      this.freeSockets[name].splice(index, 1)
      if (this.freeSockets[name].length === 0) {
        delete this.freeSockets[name]
      }
    }
  }

  if (this.requests[name] && this.requests[name].length) {
    // If we have pending requests and a socket gets closed a new one
    // needs to be created to take over in the pool for the one that closed.
    this.createSocket(name, host, port).emit('free')
  }
}

function ForeverAgentSSL (options) {
  ForeverAgent.call(this, options)
}
util.inherits(ForeverAgentSSL, ForeverAgent)

ForeverAgentSSL.prototype.createConnection = createConnectionSSL
ForeverAgentSSL.prototype.addRequestNoreuse = AgentSSL.prototype.addRequest

function createConnectionSSL (port, host, options) {
  if (typeof port === 'object') {
    options = port;
  } else if (typeof host === 'object') {
    options = host;
  } else if (typeof options === 'object') {
    options = options;
  } else {
    options = {};
  }

  if (typeof port === 'number') {
    options.port = port;
  }

  if (typeof host === 'string') {
    options.host = host;
  }

  return tls.connect(options);
}

},{"http":undefined,"https":undefined,"net":undefined,"tls":undefined,"util":undefined}],35:[function(require,module,exports){
var CombinedStream = require('combined-stream');
var util = require('util');
var path = require('path');
var http = require('http');
var https = require('https');
var parseUrl = require('url').parse;
var fs = require('fs');
var mime = require('mime-types');
var async = require('async');

module.exports = FormData;
function FormData() {
  this._overheadLength = 0;
  this._valueLength = 0;
  this._lengthRetrievers = [];

  CombinedStream.call(this);
}
util.inherits(FormData, CombinedStream);

FormData.LINE_BREAK = '\r\n';

FormData.prototype.append = function(field, value, options) {
  options = options || {};

  var append = CombinedStream.prototype.append.bind(this);

  // all that streamy business can't handle numbers
  if (typeof value == 'number') value = ''+value;

  // https://github.com/felixge/node-form-data/issues/38
  if (util.isArray(value)) {
    // Please convert your array into string
    // the way web server expects it
    this._error(new Error('Arrays are not supported.'));
    return;
  }

  var header = this._multiPartHeader(field, value, options);
  var footer = this._multiPartFooter(field, value, options);

  append(header);
  append(value);
  append(footer);

  // pass along options.knownLength
  this._trackLength(header, value, options);
};

FormData.prototype._trackLength = function(header, value, options) {
  var valueLength = 0;

  // used w/ getLengthSync(), when length is known.
  // e.g. for streaming directly from a remote server,
  // w/ a known file a size, and not wanting to wait for
  // incoming file to finish to get its size.
  if (options.knownLength != null) {
    valueLength += +options.knownLength;
  } else if (Buffer.isBuffer(value)) {
    valueLength = value.length;
  } else if (typeof value === 'string') {
    valueLength = Buffer.byteLength(value);
  }

  this._valueLength += valueLength;

  // @check why add CRLF? does this account for custom/multiple CRLFs?
  this._overheadLength +=
    Buffer.byteLength(header) +
    FormData.LINE_BREAK.length;

  // empty or either doesn't have path or not an http response
  if (!value || ( !value.path && !(value.readable && value.hasOwnProperty('httpVersion')) )) {
    return;
  }

  // no need to bother with the length
  if (!options.knownLength)
  this._lengthRetrievers.push(function(next) {

    if (value.hasOwnProperty('fd')) {

      // take read range into a account
      // `end` = Infinity –> read file till the end
      //
      // TODO: Looks like there is bug in Node fs.createReadStream
      // it doesn't respect `end` options without `start` options
      // Fix it when node fixes it.
      // https://github.com/joyent/node/issues/7819
      if (value.end != undefined && value.end != Infinity && value.start != undefined) {

        // when end specified
        // no need to calculate range
        // inclusive, starts with 0
        next(null, value.end+1 - (value.start ? value.start : 0));

      // not that fast snoopy
      } else {
        // still need to fetch file size from fs
        fs.stat(value.path, function(err, stat) {

          var fileSize;

          if (err) {
            next(err);
            return;
          }

          // update final size based on the range options
          fileSize = stat.size - (value.start ? value.start : 0);
          next(null, fileSize);
        });
      }

    // or http response
    } else if (value.hasOwnProperty('httpVersion')) {
      next(null, +value.headers['content-length']);

    // or request stream http://github.com/mikeal/request
    } else if (value.hasOwnProperty('httpModule')) {
      // wait till response come back
      value.on('response', function(response) {
        value.pause();
        next(null, +response.headers['content-length']);
      });
      value.resume();

    // something else
    } else {
      next('Unknown stream');
    }
  });
};

FormData.prototype._multiPartHeader = function(field, value, options) {
  var boundary = this.getBoundary();
  var header = '';

  // custom header specified (as string)?
  // it becomes responsible for boundary
  // (e.g. to handle extra CRLFs on .NET servers)
  if (options.header != null) {
    header = options.header;
  } else {
    header += '--' + boundary + FormData.LINE_BREAK +
      'Content-Disposition: form-data; name="' + field + '"';

    // fs- and request- streams have path property
    // or use custom filename and/or contentType
    // TODO: Use request's response mime-type
    if (options.filename || value.path) {
      header +=
        '; filename="' + path.basename(options.filename || value.path) + '"' + FormData.LINE_BREAK +
        'Content-Type: ' +  (options.contentType || mime.lookup(options.filename || value.path));

    // http response has not
    } else if (value.readable && value.hasOwnProperty('httpVersion')) {
      header +=
        '; filename="' + path.basename(value.client._httpMessage.path) + '"' + FormData.LINE_BREAK +
        'Content-Type: ' + value.headers['content-type'];
    }

    header += FormData.LINE_BREAK + FormData.LINE_BREAK;
  }

  return header;
};

FormData.prototype._multiPartFooter = function(field, value, options) {
  return function(next) {
    var footer = FormData.LINE_BREAK;

    var lastPart = (this._streams.length === 0);
    if (lastPart) {
      footer += this._lastBoundary();
    }

    next(footer);
  }.bind(this);
};

FormData.prototype._lastBoundary = function() {
  return '--' + this.getBoundary() + '--' + FormData.LINE_BREAK;
};

FormData.prototype.getHeaders = function(userHeaders) {
  var formHeaders = {
    'content-type': 'multipart/form-data; boundary=' + this.getBoundary()
  };

  for (var header in userHeaders) {
    formHeaders[header.toLowerCase()] = userHeaders[header];
  }

  return formHeaders;
}

FormData.prototype.getCustomHeaders = function(contentType) {
    contentType = contentType ? contentType : 'multipart/form-data';

    var formHeaders = {
        'content-type': contentType + '; boundary=' + this.getBoundary(),
        'content-length': this.getLengthSync()
    };

    return formHeaders;
}

FormData.prototype.getBoundary = function() {
  if (!this._boundary) {
    this._generateBoundary();
  }

  return this._boundary;
};

FormData.prototype._generateBoundary = function() {
  // This generates a 50 character boundary similar to those used by Firefox.
  // They are optimized for boyer-moore parsing.
  var boundary = '--------------------------';
  for (var i = 0; i < 24; i++) {
    boundary += Math.floor(Math.random() * 10).toString(16);
  }

  this._boundary = boundary;
};

// Note: getLengthSync DOESN'T calculate streams length
// As workaround one can calculate file size manually
// and add it as knownLength option
FormData.prototype.getLengthSync = function(debug) {
  var knownLength = this._overheadLength + this._valueLength;

  // Don't get confused, there are 3 "internal" streams for each keyval pair
  // so it basically checks if there is any value added to the form
  if (this._streams.length) {
    knownLength += this._lastBoundary().length;
  }

  // https://github.com/felixge/node-form-data/issues/40
  if (this._lengthRetrievers.length) {
    // Some async length retrivers are present
    // therefore synchronous length calculation is false.
    // Please use getLength(callback) to get proper length
    this._error(new Error('Cannot calculate proper length in synchronous way.'));
  }

  return knownLength;
};

FormData.prototype.getLength = function(cb) {
  var knownLength = this._overheadLength + this._valueLength;

  if (this._streams.length) {
    knownLength += this._lastBoundary().length;
  }

  if (!this._lengthRetrievers.length) {
    process.nextTick(cb.bind(this, null, knownLength));
    return;
  }

  async.parallel(this._lengthRetrievers, function(err, values) {
    if (err) {
      cb(err);
      return;
    }

    values.forEach(function(length) {
      knownLength += length;
    });

    cb(null, knownLength);
  });
};

FormData.prototype.submit = function(params, cb) {

  var request
    , options
    , defaults = {
        method : 'post'
    };

  // parse provided url if it's string
  // or treat it as options object
  if (typeof params == 'string') {
    params = parseUrl(params);

    options = populate({
      port: params.port,
      path: params.pathname,
      host: params.hostname
    }, defaults);
  }
  else // use custom params
  {
    options = populate(params, defaults);
    // if no port provided use default one
    if (!options.port) {
      options.port = options.protocol == 'https:' ? 443 : 80;
    }
  }

  // put that good code in getHeaders to some use
  options.headers = this.getHeaders(params.headers);

  // https if specified, fallback to http in any other case
  if (options.protocol == 'https:') {
    request = https.request(options);
  } else {
    request = http.request(options);
  }

  // get content length and fire away
  this.getLength(function(err, length) {

    // TODO: Add chunked encoding when no length (if err)

    // add content length
    request.setHeader('Content-Length', length);

    this.pipe(request);
    if (cb) {
      request.on('error', cb);
      request.on('response', cb.bind(this, null));
    }
  }.bind(this));

  return request;
};

FormData.prototype._error = function(err) {
  if (this.error) return;

  this.error = err;
  this.pause();
  this.emit('error', err);
};

/*
 * Santa's little helpers
 */

// populates missing values
function populate(dst, src) {
  for (var prop in src) {
    if (!dst[prop]) dst[prop] = src[prop];
  }
  return dst;
}

},{"async":36,"combined-stream":31,"fs":undefined,"http":undefined,"https":undefined,"mime-types":93,"path":undefined,"url":undefined,"util":undefined}],36:[function(require,module,exports){
/*!
 * async
 * https://github.com/caolan/async
 *
 * Copyright 2010-2014 Caolan McMahon
 * Released under the MIT license
 */
(function () {

    var async = {};
    function noop() {}
    function identity(v) {
        return v;
    }
    function toBool(v) {
        return !!v;
    }
    function notId(v) {
        return !v;
    }

    // global on the server, window in the browser
    var previous_async;

    // Establish the root object, `window` (`self`) in the browser, `global`
    // on the server, or `this` in some virtual machines. We use `self`
    // instead of `window` for `WebWorker` support.
    var root = typeof self === 'object' && self.self === self && self ||
            typeof global === 'object' && global.global === global && global ||
            this;

    if (root != null) {
        previous_async = root.async;
    }

    async.noConflict = function () {
        root.async = previous_async;
        return async;
    };

    function only_once(fn) {
        return function() {
            if (fn === null) throw new Error("Callback was already called.");
            fn.apply(this, arguments);
            fn = null;
        };
    }

    function _once(fn) {
        return function() {
            if (fn === null) return;
            fn.apply(this, arguments);
            fn = null;
        };
    }

    //// cross-browser compatiblity functions ////

    var _toString = Object.prototype.toString;

    var _isArray = Array.isArray || function (obj) {
        return _toString.call(obj) === '[object Array]';
    };

    function _isArrayLike(arr) {
        return _isArray(arr) || (
            // has a positive integer length property
            typeof arr.length === "number" &&
            arr.length >= 0 &&
            arr.length % 1 === 0
        );
    }

    function _each(coll, iterator) {
        return _isArrayLike(coll) ?
            _arrayEach(coll, iterator) :
            _forEachOf(coll, iterator);
    }

    function _arrayEach(arr, iterator) {
        var index = -1,
            length = arr.length;

        while (++index < length) {
            iterator(arr[index], index, arr);
        }
    }

    function _map(arr, iterator) {
        var index = -1,
            length = arr.length,
            result = Array(length);

        while (++index < length) {
            result[index] = iterator(arr[index], index, arr);
        }
        return result;
    }

    function _range(count) {
        return _map(Array(count), function (v, i) { return i; });
    }

    function _reduce(arr, iterator, memo) {
        _arrayEach(arr, function (x, i, a) {
            memo = iterator(memo, x, i, a);
        });
        return memo;
    }

    function _forEachOf(object, iterator) {
        _arrayEach(_keys(object), function (key) {
            iterator(object[key], key);
        });
    }

    function _indexOf(arr, item) {
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] === item) return i;
        }
        return -1;
    }

    var _keys = Object.keys || function (obj) {
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                keys.push(k);
            }
        }
        return keys;
    };

    function _keyIterator(coll) {
        var i = -1;
        var len;
        var keys;
        if (_isArrayLike(coll)) {
            len = coll.length;
            return function next() {
                i++;
                return i < len ? i : null;
            };
        } else {
            keys = _keys(coll);
            len = keys.length;
            return function next() {
                i++;
                return i < len ? keys[i] : null;
            };
        }
    }

    // Similar to ES6's rest param (http://ariya.ofilabs.com/2013/03/es6-and-rest-parameter.html)
    // This accumulates the arguments passed into an array, after a given index.
    // From underscore.js (https://github.com/jashkenas/underscore/pull/2140).
    function _restParam(func, startIndex) {
        startIndex = startIndex == null ? func.length - 1 : +startIndex;
        return function() {
            var length = Math.max(arguments.length - startIndex, 0);
            var rest = Array(length);
            for (var index = 0; index < length; index++) {
                rest[index] = arguments[index + startIndex];
            }
            switch (startIndex) {
                case 0: return func.call(this, rest);
                case 1: return func.call(this, arguments[0], rest);
                case 2: return func.call(this, arguments[0], arguments[1], rest);
            }
            // Currently unused but handle cases outside of the switch statement:
            // var args = Array(startIndex + 1);
            // for (index = 0; index < startIndex; index++) {
            //     args[index] = arguments[index];
            // }
            // args[startIndex] = rest;
            // return func.apply(this, args);
        };
    }

    function _withoutIndex(iterator) {
        return function (value, index, callback) {
            return iterator(value, callback);
        };
    }

    //// exported async module functions ////

    //// nextTick implementation with browser-compatible fallback ////

    // capture the global reference to guard against fakeTimer mocks
    var _setImmediate = typeof setImmediate === 'function' && setImmediate;

    var _delay = _setImmediate ? function(fn) {
        // not a direct alias for IE10 compatibility
        _setImmediate(fn);
    } : function(fn) {
        setTimeout(fn, 0);
    };

    if (typeof process === 'object' && typeof process.nextTick === 'function') {
        async.nextTick = process.nextTick;
    } else {
        async.nextTick = _delay;
    }
    async.setImmediate = _setImmediate ? _delay : async.nextTick;


    async.forEach =
    async.each = function (arr, iterator, callback) {
        return async.eachOf(arr, _withoutIndex(iterator), callback);
    };

    async.forEachSeries =
    async.eachSeries = function (arr, iterator, callback) {
        return async.eachOfSeries(arr, _withoutIndex(iterator), callback);
    };


    async.forEachLimit =
    async.eachLimit = function (arr, limit, iterator, callback) {
        return _eachOfLimit(limit)(arr, _withoutIndex(iterator), callback);
    };

    async.forEachOf =
    async.eachOf = function (object, iterator, callback) {
        callback = _once(callback || noop);
        object = object || [];
        var size = _isArrayLike(object) ? object.length : _keys(object).length;
        var completed = 0;
        if (!size) {
            return callback(null);
        }
        _each(object, function (value, key) {
            iterator(object[key], key, only_once(done));
        });
        function done(err) {
            if (err) {
                callback(err);
            }
            else {
                completed += 1;
                if (completed >= size) {
                    callback(null);
                }
            }
        }
    };

    async.forEachOfSeries =
    async.eachOfSeries = function (obj, iterator, callback) {
        callback = _once(callback || noop);
        obj = obj || [];
        var nextKey = _keyIterator(obj);
        var key = nextKey();
        function iterate() {
            var sync = true;
            if (key === null) {
                return callback(null);
            }
            iterator(obj[key], key, only_once(function (err) {
                if (err) {
                    callback(err);
                }
                else {
                    key = nextKey();
                    if (key === null) {
                        return callback(null);
                    } else {
                        if (sync) {
                            async.nextTick(iterate);
                        } else {
                            iterate();
                        }
                    }
                }
            }));
            sync = false;
        }
        iterate();
    };



    async.forEachOfLimit =
    async.eachOfLimit = function (obj, limit, iterator, callback) {
        _eachOfLimit(limit)(obj, iterator, callback);
    };

    function _eachOfLimit(limit) {

        return function (obj, iterator, callback) {
            callback = _once(callback || noop);
            obj = obj || [];
            var nextKey = _keyIterator(obj);
            if (limit <= 0) {
                return callback(null);
            }
            var done = false;
            var running = 0;
            var errored = false;

            (function replenish () {
                if (done && running <= 0) {
                    return callback(null);
                }

                while (running < limit && !errored) {
                    var key = nextKey();
                    if (key === null) {
                        done = true;
                        if (running <= 0) {
                            callback(null);
                        }
                        return;
                    }
                    running += 1;
                    iterator(obj[key], key, only_once(function (err) {
                        running -= 1;
                        if (err) {
                            callback(err);
                            errored = true;
                        }
                        else {
                            replenish();
                        }
                    }));
                }
            })();
        };
    }


    function doParallel(fn) {
        return function (obj, iterator, callback) {
            return fn(async.eachOf, obj, iterator, callback);
        };
    }
    function doParallelLimit(fn) {
        return function (obj, limit, iterator, callback) {
            return fn(_eachOfLimit(limit), obj, iterator, callback);
        };
    }
    function doSeries(fn) {
        return function (obj, iterator, callback) {
            return fn(async.eachOfSeries, obj, iterator, callback);
        };
    }

    function _asyncMap(eachfn, arr, iterator, callback) {
        callback = _once(callback || noop);
        var results = [];
        eachfn(arr, function (value, index, callback) {
            iterator(value, function (err, v) {
                results[index] = v;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    }

    async.map = doParallel(_asyncMap);
    async.mapSeries = doSeries(_asyncMap);
    async.mapLimit = doParallelLimit(_asyncMap);

    // reduce only has a series version, as doing reduce in parallel won't
    // work in many situations.
    async.inject =
    async.foldl =
    async.reduce = function (arr, memo, iterator, callback) {
        async.eachOfSeries(arr, function (x, i, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err || null, memo);
        });
    };

    async.foldr =
    async.reduceRight = function (arr, memo, iterator, callback) {
        var reversed = _map(arr, identity).reverse();
        async.reduce(reversed, memo, iterator, callback);
    };

    function _filter(eachfn, arr, iterator, callback) {
        var results = [];
        eachfn(arr, function (x, index, callback) {
            iterator(x, function (v) {
                if (v) {
                    results.push({index: index, value: x});
                }
                callback();
            });
        }, function () {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    }

    async.select =
    async.filter = doParallel(_filter);

    async.selectLimit =
    async.filterLimit = doParallelLimit(_filter);

    async.selectSeries =
    async.filterSeries = doSeries(_filter);

    function _reject(eachfn, arr, iterator, callback) {
        _filter(eachfn, arr, function(value, cb) {
            iterator(value, function(v) {
                cb(!v);
            });
        }, callback);
    }
    async.reject = doParallel(_reject);
    async.rejectLimit = doParallelLimit(_reject);
    async.rejectSeries = doSeries(_reject);

    function _createTester(eachfn, check, getResult) {
        return function(arr, limit, iterator, cb) {
            function done() {
                if (cb) cb(getResult(false, void 0));
            }
            function iteratee(x, _, callback) {
                if (!cb) return callback();
                iterator(x, function (v) {
                    if (cb && check(v)) {
                        cb(getResult(true, x));
                        cb = iterator = false;
                    }
                    callback();
                });
            }
            if (arguments.length > 3) {
                eachfn(arr, limit, iteratee, done);
            } else {
                cb = iterator;
                iterator = limit;
                eachfn(arr, iteratee, done);
            }
        };
    }

    async.any =
    async.some = _createTester(async.eachOf, toBool, identity);

    async.someLimit = _createTester(async.eachOfLimit, toBool, identity);

    async.all =
    async.every = _createTester(async.eachOf, notId, notId);

    async.everyLimit = _createTester(async.eachOfLimit, notId, notId);

    function _findGetResult(v, x) {
        return x;
    }
    async.detect = _createTester(async.eachOf, identity, _findGetResult);
    async.detectSeries = _createTester(async.eachOfSeries, identity, _findGetResult);

    async.sortBy = function (arr, iterator, callback) {
        async.map(arr, function (x, callback) {
            iterator(x, function (err, criteria) {
                if (err) {
                    callback(err);
                }
                else {
                    callback(null, {value: x, criteria: criteria});
                }
            });
        }, function (err, results) {
            if (err) {
                return callback(err);
            }
            else {
                callback(null, _map(results.sort(comparator), function (x) {
                    return x.value;
                }));
            }

        });

        function comparator(left, right) {
            var a = left.criteria, b = right.criteria;
            return a < b ? -1 : a > b ? 1 : 0;
        }
    };

    async.auto = function (tasks, callback) {
        callback = _once(callback || noop);
        var keys = _keys(tasks);
        var remainingTasks = keys.length;
        if (!remainingTasks) {
            return callback(null);
        }

        var results = {};

        var listeners = [];
        function addListener(fn) {
            listeners.unshift(fn);
        }
        function removeListener(fn) {
            var idx = _indexOf(listeners, fn);
            if (idx >= 0) listeners.splice(idx, 1);
        }
        function taskComplete() {
            remainingTasks--;
            _arrayEach(listeners.slice(0), function (fn) {
                fn();
            });
        }

        addListener(function () {
            if (!remainingTasks) {
                callback(null, results);
            }
        });

        _arrayEach(keys, function (k) {
            var task = _isArray(tasks[k]) ? tasks[k]: [tasks[k]];
            var taskCallback = _restParam(function(err, args) {
                if (args.length <= 1) {
                    args = args[0];
                }
                if (err) {
                    var safeResults = {};
                    _forEachOf(results, function(val, rkey) {
                        safeResults[rkey] = val;
                    });
                    safeResults[k] = args;
                    callback(err, safeResults);
                }
                else {
                    results[k] = args;
                    async.setImmediate(taskComplete);
                }
            });
            var requires = task.slice(0, task.length - 1);
            // prevent dead-locks
            var len = requires.length;
            var dep;
            while (len--) {
                if (!(dep = tasks[requires[len]])) {
                    throw new Error('Has inexistant dependency');
                }
                if (_isArray(dep) && _indexOf(dep, k) >= 0) {
                    throw new Error('Has cyclic dependencies');
                }
            }
            function ready() {
                return _reduce(requires, function (a, x) {
                    return (a && results.hasOwnProperty(x));
                }, true) && !results.hasOwnProperty(k);
            }
            if (ready()) {
                task[task.length - 1](taskCallback, results);
            }
            else {
                addListener(listener);
            }
            function listener() {
                if (ready()) {
                    removeListener(listener);
                    task[task.length - 1](taskCallback, results);
                }
            }
        });
    };



    async.retry = function(times, task, callback) {
        var DEFAULT_TIMES = 5;
        var DEFAULT_INTERVAL = 0;

        var attempts = [];

        var opts = {
            times: DEFAULT_TIMES,
            interval: DEFAULT_INTERVAL
        };

        function parseTimes(acc, t){
            if(typeof t === 'number'){
                acc.times = parseInt(t, 10) || DEFAULT_TIMES;
            } else if(typeof t === 'object'){
                acc.times = parseInt(t.times, 10) || DEFAULT_TIMES;
                acc.interval = parseInt(t.interval, 10) || DEFAULT_INTERVAL;
            } else {
                throw new Error('Unsupported argument type for \'times\': ' + typeof(t));
            }
        }

        var length = arguments.length;
        if (length < 1 || length > 3) {
            throw new Error('Invalid arguments - must be either (task), (task, callback), (times, task) or (times, task, callback)');
        } else if (length <= 2 && typeof times === 'function') {
            callback = task;
            task = times;
        }
        if (typeof times !== 'function') {
            parseTimes(opts, times);
        }
        opts.callback = callback;
        opts.task = task;

        function wrappedTask(wrappedCallback, wrappedResults) {
            function retryAttempt(task, finalAttempt) {
                return function(seriesCallback) {
                    task(function(err, result){
                        seriesCallback(!err || finalAttempt, {err: err, result: result});
                    }, wrappedResults);
                };
            }

            function retryInterval(interval){
                return function(seriesCallback){
                    setTimeout(function(){
                        seriesCallback(null);
                    }, interval);
                };
            }

            while (opts.times) {

                var finalAttempt = !(opts.times-=1);
                attempts.push(retryAttempt(opts.task, finalAttempt));
                if(!finalAttempt && opts.interval > 0){
                    attempts.push(retryInterval(opts.interval));
                }
            }

            async.series(attempts, function(done, data){
                data = data[data.length - 1];
                (wrappedCallback || opts.callback)(data.err, data.result);
            });
        }

        // If a callback is passed, run this as a controll flow
        return opts.callback ? wrappedTask() : wrappedTask;
    };

    async.waterfall = function (tasks, callback) {
        callback = _once(callback || noop);
        if (!_isArray(tasks)) {
            var err = new Error('First argument to waterfall must be an array of functions');
            return callback(err);
        }
        if (!tasks.length) {
            return callback();
        }
        function wrapIterator(iterator) {
            return _restParam(function (err, args) {
                if (err) {
                    callback.apply(null, [err].concat(args));
                }
                else {
                    var next = iterator.next();
                    if (next) {
                        args.push(wrapIterator(next));
                    }
                    else {
                        args.push(callback);
                    }
                    ensureAsync(iterator).apply(null, args);
                }
            });
        }
        wrapIterator(async.iterator(tasks))();
    };

    function _parallel(eachfn, tasks, callback) {
        callback = callback || noop;
        var results = _isArrayLike(tasks) ? [] : {};

        eachfn(tasks, function (task, key, callback) {
            task(_restParam(function (err, args) {
                if (args.length <= 1) {
                    args = args[0];
                }
                results[key] = args;
                callback(err);
            }));
        }, function (err) {
            callback(err, results);
        });
    }

    async.parallel = function (tasks, callback) {
        _parallel(async.eachOf, tasks, callback);
    };

    async.parallelLimit = function(tasks, limit, callback) {
        _parallel(_eachOfLimit(limit), tasks, callback);
    };

    async.series = function(tasks, callback) {
        _parallel(async.eachOfSeries, tasks, callback);
    };

    async.iterator = function (tasks) {
        function makeCallback(index) {
            function fn() {
                if (tasks.length) {
                    tasks[index].apply(null, arguments);
                }
                return fn.next();
            }
            fn.next = function () {
                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
            };
            return fn;
        }
        return makeCallback(0);
    };

    async.apply = _restParam(function (fn, args) {
        return _restParam(function (callArgs) {
            return fn.apply(
                null, args.concat(callArgs)
            );
        });
    });

    function _concat(eachfn, arr, fn, callback) {
        var result = [];
        eachfn(arr, function (x, index, cb) {
            fn(x, function (err, y) {
                result = result.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, result);
        });
    }
    async.concat = doParallel(_concat);
    async.concatSeries = doSeries(_concat);

    async.whilst = function (test, iterator, callback) {
        callback = callback || noop;
        if (test()) {
            var next = _restParam(function(err, args) {
                if (err) {
                    callback(err);
                } else if (test.apply(this, args)) {
                    iterator(next);
                } else {
                    callback(null);
                }
            });
            iterator(next);
        } else {
            callback(null);
        }
    };

    async.doWhilst = function (iterator, test, callback) {
        var calls = 0;
        return async.whilst(function() {
            return ++calls <= 1 || test.apply(this, arguments);
        }, iterator, callback);
    };

    async.until = function (test, iterator, callback) {
        return async.whilst(function() {
            return !test.apply(this, arguments);
        }, iterator, callback);
    };

    async.doUntil = function (iterator, test, callback) {
        return async.doWhilst(iterator, function() {
            return !test.apply(this, arguments);
        }, callback);
    };

    async.during = function (test, iterator, callback) {
        callback = callback || noop;

        var next = _restParam(function(err, args) {
            if (err) {
                callback(err);
            } else {
                args.push(check);
                test.apply(this, args);
            }
        });

        var check = function(err, truth) {
            if (err) {
                callback(err);
            } else if (truth) {
                iterator(next);
            } else {
                callback(null);
            }
        };

        test(check);
    };

    async.doDuring = function (iterator, test, callback) {
        var calls = 0;
        async.during(function(next) {
            if (calls++ < 1) {
                next(null, true);
            } else {
                test.apply(this, arguments);
            }
        }, iterator, callback);
    };

    function _queue(worker, concurrency, payload) {
        if (concurrency == null) {
            concurrency = 1;
        }
        else if(concurrency === 0) {
            throw new Error('Concurrency must not be zero');
        }
        function _insert(q, data, pos, callback) {
            if (callback != null && typeof callback !== "function") {
                throw new Error("task callback must be a function");
            }
            q.started = true;
            if (!_isArray(data)) {
                data = [data];
            }
            if(data.length === 0 && q.idle()) {
                // call drain immediately if there are no tasks
                return async.setImmediate(function() {
                    q.drain();
                });
            }
            _arrayEach(data, function(task) {
                var item = {
                    data: task,
                    callback: callback || noop
                };

                if (pos) {
                    q.tasks.unshift(item);
                } else {
                    q.tasks.push(item);
                }

                if (q.tasks.length === q.concurrency) {
                    q.saturated();
                }
            });
            async.setImmediate(q.process);
        }
        function _next(q, tasks) {
            return function(){
                workers -= 1;
                var args = arguments;
                _arrayEach(tasks, function (task) {
                    task.callback.apply(task, args);
                });
                if (q.tasks.length + workers === 0) {
                    q.drain();
                }
                q.process();
            };
        }

        var workers = 0;
        var q = {
            tasks: [],
            concurrency: concurrency,
            payload: payload,
            saturated: noop,
            empty: noop,
            drain: noop,
            started: false,
            paused: false,
            push: function (data, callback) {
                _insert(q, data, false, callback);
            },
            kill: function () {
                q.drain = noop;
                q.tasks = [];
            },
            unshift: function (data, callback) {
                _insert(q, data, true, callback);
            },
            process: function () {
                if (!q.paused && workers < q.concurrency && q.tasks.length) {
                    while(workers < q.concurrency && q.tasks.length){
                        var tasks = q.payload ?
                            q.tasks.splice(0, q.payload) :
                            q.tasks.splice(0, q.tasks.length);

                        var data = _map(tasks, function (task) {
                            return task.data;
                        });

                        if (q.tasks.length === 0) {
                            q.empty();
                        }
                        workers += 1;
                        var cb = only_once(_next(q, tasks));
                        worker(data, cb);
                    }
                }
            },
            length: function () {
                return q.tasks.length;
            },
            running: function () {
                return workers;
            },
            idle: function() {
                return q.tasks.length + workers === 0;
            },
            pause: function () {
                q.paused = true;
            },
            resume: function () {
                if (q.paused === false) { return; }
                q.paused = false;
                var resumeCount = Math.min(q.concurrency, q.tasks.length);
                // Need to call q.process once per concurrent
                // worker to preserve full concurrency after pause
                for (var w = 1; w <= resumeCount; w++) {
                    async.setImmediate(q.process);
                }
            }
        };
        return q;
    }

    async.queue = function (worker, concurrency) {
        var q = _queue(function (items, cb) {
            worker(items[0], cb);
        }, concurrency, 1);

        return q;
    };

    async.priorityQueue = function (worker, concurrency) {

        function _compareTasks(a, b){
            return a.priority - b.priority;
        }

        function _binarySearch(sequence, item, compare) {
            var beg = -1,
                end = sequence.length - 1;
            while (beg < end) {
                var mid = beg + ((end - beg + 1) >>> 1);
                if (compare(item, sequence[mid]) >= 0) {
                    beg = mid;
                } else {
                    end = mid - 1;
                }
            }
            return beg;
        }

        function _insert(q, data, priority, callback) {
            if (callback != null && typeof callback !== "function") {
                throw new Error("task callback must be a function");
            }
            q.started = true;
            if (!_isArray(data)) {
                data = [data];
            }
            if(data.length === 0) {
                // call drain immediately if there are no tasks
                return async.setImmediate(function() {
                    q.drain();
                });
            }
            _arrayEach(data, function(task) {
                var item = {
                    data: task,
                    priority: priority,
                    callback: typeof callback === 'function' ? callback : noop
                };

                q.tasks.splice(_binarySearch(q.tasks, item, _compareTasks) + 1, 0, item);

                if (q.tasks.length === q.concurrency) {
                    q.saturated();
                }
                async.setImmediate(q.process);
            });
        }

        // Start with a normal queue
        var q = async.queue(worker, concurrency);

        // Override push to accept second parameter representing priority
        q.push = function (data, priority, callback) {
            _insert(q, data, priority, callback);
        };

        // Remove unshift function
        delete q.unshift;

        return q;
    };

    async.cargo = function (worker, payload) {
        return _queue(worker, 1, payload);
    };

    function _console_fn(name) {
        return _restParam(function (fn, args) {
            fn.apply(null, args.concat([_restParam(function (err, args) {
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _arrayEach(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            })]));
        });
    }
    async.log = _console_fn('log');
    async.dir = _console_fn('dir');
    /*async.info = _console_fn('info');
    async.warn = _console_fn('warn');
    async.error = _console_fn('error');*/

    async.memoize = function (fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || identity;
        var memoized = _restParam(function memoized(args) {
            var callback = args.pop();
            var key = hasher.apply(null, args);
            if (key in memo) {
                async.nextTick(function () {
                    callback.apply(null, memo[key]);
                });
            }
            else if (key in queues) {
                queues[key].push(callback);
            }
            else {
                queues[key] = [callback];
                fn.apply(null, args.concat([_restParam(function (args) {
                    memo[key] = args;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                        q[i].apply(null, args);
                    }
                })]));
            }
        });
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    };

    async.unmemoize = function (fn) {
        return function () {
            return (fn.unmemoized || fn).apply(null, arguments);
        };
    };

    function _times(mapper) {
        return function (count, iterator, callback) {
            mapper(_range(count), iterator, callback);
        };
    }

    async.times = _times(async.map);
    async.timesSeries = _times(async.mapSeries);
    async.timesLimit = function (count, limit, iterator, callback) {
        return async.mapLimit(_range(count), limit, iterator, callback);
    };

    async.seq = function (/* functions... */) {
        var fns = arguments;
        return _restParam(function (args) {
            var that = this;

            var callback = args[args.length - 1];
            if (typeof callback == 'function') {
                args.pop();
            } else {
                callback = noop;
            }

            async.reduce(fns, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([_restParam(function (err, nextargs) {
                    cb(err, nextargs);
                })]));
            },
            function (err, results) {
                callback.apply(that, [err].concat(results));
            });
        });
    };

    async.compose = function (/* functions... */) {
        return async.seq.apply(null, Array.prototype.reverse.call(arguments));
    };


    function _applyEach(eachfn) {
        return _restParam(function(fns, args) {
            var go = _restParam(function(args) {
                var that = this;
                var callback = args.pop();
                return eachfn(fns, function (fn, _, cb) {
                    fn.apply(that, args.concat([cb]));
                },
                callback);
            });
            if (args.length) {
                return go.apply(this, args);
            }
            else {
                return go;
            }
        });
    }

    async.applyEach = _applyEach(async.eachOf);
    async.applyEachSeries = _applyEach(async.eachOfSeries);


    async.forever = function (fn, callback) {
        var done = only_once(callback || noop);
        var task = ensureAsync(fn);
        function next(err) {
            if (err) {
                return done(err);
            }
            task(next);
        }
        next();
    };

    function ensureAsync(fn) {
        return _restParam(function (args) {
            var callback = args.pop();
            args.push(function () {
                var innerArgs = arguments;
                if (sync) {
                    async.setImmediate(function () {
                        callback.apply(null, innerArgs);
                    });
                } else {
                    callback.apply(null, innerArgs);
                }
            });
            var sync = true;
            fn.apply(this, args);
            sync = false;
        });
    }

    async.ensureAsync = ensureAsync;

    async.constant = _restParam(function(values) {
        var args = [null].concat(values);
        return function (callback) {
            return callback.apply(this, args);
        };
    });

    async.wrapSync =
    async.asyncify = function asyncify(func) {
        return _restParam(function (args) {
            var callback = args.pop();
            var result;
            try {
                result = func.apply(this, args);
            } catch (e) {
                return callback(e);
            }
            // if result is Promise object
            if (typeof result !== 'undefined' && typeof result.then === "function") {
                result.then(function(value) {
                    callback(null, value);
                }).catch(function(err) {
                    callback(err.message ? err : new Error(err));
                });
            } else {
                callback(null, result);
            }
        });
    };

    // Node.js
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
    }
    // AMD / RequireJS
    else if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return async;
        });
    }
    // included directly via <script> tag
    else {
        root.async = async;
    }

}());

},{}],37:[function(require,module,exports){
'use strict'

function ValidationError (errors) {
  this.name = 'ValidationError'
  this.errors = errors
}

ValidationError.prototype = Error.prototype

module.exports = ValidationError

},{}],38:[function(require,module,exports){
'use strict'

var schemas = require('./schemas')
var ValidationError = require('./error')
var validator = require('is-my-json-valid')

var runner = function (schema, data, cb) {
  var validate = validator(schema, {
    greedy: true,
    verbose: true,
    schemas: schemas
  })

  var valid = false

  if (data !== undefined) {
    // execute is-my-json-valid
    valid = validate(data)
  }

  // callback?
  if (!cb) {
    return valid
  } else {
    return cb(validate.errors ? new ValidationError(validate.errors) : null, valid)
  }

  return valid
}

module.exports = function (data, cb) {
  return runner(schemas.har, data, cb)
}

Object.keys(schemas).map(function (name) {
  module.exports[name] = function (data, cb) {
    return runner(schemas[name], data, cb)
  }
})

},{"./error":37,"./schemas":46,"is-my-json-valid":56}],39:[function(require,module,exports){
module.exports={
  "properties": {
    "beforeRequest": {
      "$ref": "#cacheEntry"
    },
    "afterRequest": {
      "$ref": "#cacheEntry"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],40:[function(require,module,exports){
module.exports={
  "oneOf": [{
    "type": "object",
    "optional": true,
    "required": [
      "lastAccess",
      "eTag",
      "hitCount"
    ],
    "properties": {
      "expires": {
        "type": "string"
      },
      "lastAccess": {
        "type": "string"
      },
      "eTag": {
        "type": "string"
      },
      "hitCount": {
        "type": "integer"
      },
      "comment": {
        "type": "string"
      }
    }
  }, {
    "type": null,
    "additionalProperties": false
  }]
}

},{}],41:[function(require,module,exports){
module.exports={
  "type": "object",
  "required": [
    "size",
    "mimeType"
  ],
  "properties": {
    "size": {
      "type": "integer"
    },
    "compression": {
      "type": "integer"
    },
    "mimeType": {
      "type": "string"
    },
    "text": {
      "type": "string"
    },
    "encoding": {
      "type": "string"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],42:[function(require,module,exports){
module.exports={
  "type": "object",
  "required": [
    "name",
    "value"
  ],
  "properties": {
    "name": {
      "type": "string"
    },
    "value": {
      "type": "string"
    },
    "path": {
      "type": "string"
    },
    "domain": {
      "type": "string"
    },
    "expires": {
      "type": ["string", "null"],
      "format": "date-time"
    },
    "httpOnly": {
      "type": "boolean"
    },
    "secure": {
      "type": "boolean"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],43:[function(require,module,exports){
module.exports={
  "type": "object",
  "required": [
    "name",
    "version"
  ],
  "properties": {
    "name": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],44:[function(require,module,exports){
module.exports={
  "type": "object",
  "optional": true,
  "required": [
    "startedDateTime",
    "time",
    "request",
    "response",
    "cache",
    "timings"
  ],
  "properties": {
    "pageref": {
      "type": "string"
    },
    "startedDateTime": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(\\d{4})(-)?(\\d\\d)(-)?(\\d\\d)(T)?(\\d\\d)(:)?(\\d\\d)(:)?(\\d\\d)(\\.\\d+)?(Z|([+-])(\\d\\d)(:)?(\\d\\d))"
    },
    "time": {
      "type": "number",
      "min": 0
    },
    "request": {
      "$ref": "#request"
    },
    "response": {
      "$ref": "#response"
    },
    "cache": {
      "$ref": "#cache"
    },
    "timings": {
      "$ref": "#timings"
    },
    "serverIPAddress": {
      "type": "string",
      "oneOf": [
        { "format": "ipv4" },
        { "format": "ipv6" }
      ]
    },
    "connection": {
      "type": "string"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],45:[function(require,module,exports){
module.exports={
  "type": "object",
  "required": [
    "log"
  ],
  "properties": {
    "log": {
      "$ref": "#log"
    }
  }
}

},{}],46:[function(require,module,exports){
'use strict'

var schemas = {
  cache: require('./cache.json'),
  cacheEntry: require('./cacheEntry.json'),
  content: require('./content.json'),
  cookie: require('./cookie.json'),
  creator: require('./creator.json'),
  entry: require('./entry.json'),
  har: require('./har.json'),
  log: require('./log.json'),
  page: require('./page.json'),
  pageTimings: require('./pageTimings.json'),
  postData: require('./postData.json'),
  record: require('./record.json'),
  request: require('./request.json'),
  response: require('./response.json'),
  timings: require('./timings.json')
}

// is-my-json-valid does not provide meaningful error messages for external schemas
// this is a workaround
schemas.cache.properties.beforeRequest = schemas.cacheEntry
schemas.cache.properties.afterRequest = schemas.cacheEntry

schemas.page.properties.pageTimings = schemas.pageTimings

schemas.request.properties.cookies.items = schemas.cookie
schemas.request.properties.headers.items = schemas.record
schemas.request.properties.queryString.items = schemas.record
schemas.request.properties.postData = schemas.postData

schemas.response.properties.cookies.items = schemas.cookie
schemas.response.properties.headers.items = schemas.record
schemas.response.properties.content = schemas.content

schemas.entry.properties.request = schemas.request
schemas.entry.properties.response = schemas.response
schemas.entry.properties.cache = schemas.cache
schemas.entry.properties.timings = schemas.timings

schemas.log.properties.creator = schemas.creator
schemas.log.properties.browser = schemas.creator
schemas.log.properties.pages.items = schemas.page
schemas.log.properties.entries.items = schemas.entry

schemas.har.properties.log = schemas.log

module.exports = schemas

},{"./cache.json":39,"./cacheEntry.json":40,"./content.json":41,"./cookie.json":42,"./creator.json":43,"./entry.json":44,"./har.json":45,"./log.json":47,"./page.json":48,"./pageTimings.json":49,"./postData.json":50,"./record.json":51,"./request.json":52,"./response.json":53,"./timings.json":54}],47:[function(require,module,exports){
module.exports={
  "type": "object",
  "required": [
    "version",
    "creator",
    "entries"
  ],
  "properties": {
    "version": {
      "type": "string"
    },
    "creator": {
      "$ref": "#creator"
    },
    "browser": {
      "$ref": "#creator"
    },
    "pages": {
      "type": "array",
      "items": {
        "$ref": "#page"
      }
    },
    "entries": {
      "type": "array",
      "items": {
        "$ref": "#entry"
      }
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],48:[function(require,module,exports){
module.exports={
  "type": "object",
  "optional": true,
  "required": [
    "startedDateTime",
    "id",
    "title",
    "pageTimings"
  ],
  "properties": {
    "startedDateTime": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(\\d{4})(-)?(\\d\\d)(-)?(\\d\\d)(T)?(\\d\\d)(:)?(\\d\\d)(:)?(\\d\\d)(\\.\\d+)?(Z|([+-])(\\d\\d)(:)?(\\d\\d))"
    },
    "id": {
      "type": "string",
      "unique": true
    },
    "title": {
      "type": "string"
    },
    "pageTimings": {
      "$ref": "#pageTimings"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],49:[function(require,module,exports){
module.exports={
  "type": "object",
  "properties": {
    "onContentLoad": {
      "type": "number",
      "min": -1
    },
    "onLoad": {
      "type": "number",
      "min": -1
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],50:[function(require,module,exports){
module.exports={
  "type": "object",
  "optional": true,
  "required": [
    "mimeType"
  ],
  "properties": {
    "mimeType": {
      "type": "string"
    },
    "text": {
      "type": "string"
    },
    "params": {
      "type": "array",
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "value": {
          "type": "string"
        },
        "fileName": {
          "type": "string"
        },
        "contentType": {
          "type": "string"
        },
        "comment": {
          "type": "string"
        }
      }
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],51:[function(require,module,exports){
module.exports={
  "type": "object",
  "required": [
    "name",
    "value"
  ],
  "properties": {
    "name": {
      "type": "string"
    },
    "value": {
      "type": "string"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],52:[function(require,module,exports){
module.exports={
  "type": "object",
  "required": [
    "method",
    "url",
    "httpVersion",
    "cookies",
    "headers",
    "queryString",
    "headersSize",
    "bodySize"
  ],
  "properties": {
    "method": {
      "type": "string"
    },
    "url": {
      "type": "string",
      "format": "uri"
    },
    "httpVersion": {
      "type": "string"
    },
    "cookies": {
      "type": "array",
      "items": {
        "$ref": "#cookie"
      }
    },
    "headers": {
      "type": "array",
      "items": {
        "$ref": "#record"
      }
    },
    "queryString": {
      "type": "array",
      "items": {
        "$ref": "#record"
      }
    },
    "postData": {
      "$ref": "#postData"
    },
    "headersSize": {
      "type": "integer"
    },
    "bodySize": {
      "type": "integer"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],53:[function(require,module,exports){
module.exports={
  "type": "object",
  "required": [
    "status",
    "statusText",
    "httpVersion",
    "cookies",
    "headers",
    "content",
    "redirectURL",
    "headersSize",
    "bodySize"
  ],
  "properties": {
    "status": {
      "type": "integer"
    },
    "statusText": {
      "type": "string"
    },
    "httpVersion": {
      "type": "string"
    },
    "cookies": {
      "type": "array",
      "items": {
        "$ref": "#cookie"
      }
    },
    "headers": {
      "type": "array",
      "items": {
        "$ref": "#record"
      }
    },
    "content": {
      "$ref": "#content"
    },
    "redirectURL": {
      "type": "string"
    },
    "headersSize": {
      "type": "integer"
    },
    "bodySize": {
      "type": "integer"
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],54:[function(require,module,exports){
module.exports={
  "required": [
    "send",
    "wait",
    "receive"
  ],
  "properties": {
    "dns": {
      "type": "number",
      "min": -1
    },
    "connect": {
      "type": "number",
      "min": -1
    },
    "blocked": {
      "type": "number",
      "min": -1
    },
    "send": {
      "type": "number",
      "min": -1
    },
    "wait": {
      "type": "number",
      "min": -1
    },
    "receive": {
      "type": "number",
      "min": -1
    },
    "ssl": {
      "type": "number",
      "min": -1
    },
    "comment": {
      "type": "string"
    }
  }
}

},{}],55:[function(require,module,exports){
exports['date-time'] = /^\d{4}-(?:0[0-9]{1}|1[0-2]{1})-[0-9]{2}[tT ]\d{2}:\d{2}:\d{2}(\.\d+)?([zZ]|[+-]\d{2}:\d{2})$/
exports['date'] = /^\d{4}-(?:0[0-9]{1}|1[0-2]{1})-[0-9]{2}$/
exports['time'] = /^\d{2}:\d{2}:\d{2}$/
exports['email'] = /^\S+@\S+$/
exports['ip-address'] = exports['ipv4'] = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
exports['ipv6'] = /^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/
exports['uri'] = /^[a-zA-Z][a-zA-Z0-9+-.]*:[^\s]*$/
exports['color'] = /(#?([0-9A-Fa-f]{3,6})\b)|(aqua)|(black)|(blue)|(fuchsia)|(gray)|(green)|(lime)|(maroon)|(navy)|(olive)|(orange)|(purple)|(red)|(silver)|(teal)|(white)|(yellow)|(rgb\(\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*,\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*,\s*\b([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\b\s*\))|(rgb\(\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*,\s*(\d?\d%|100%)+\s*\))/
exports['hostname'] = /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/
exports['alpha'] = /^[a-zA-Z]+$/
exports['alphanumeric'] = /^[a-zA-Z0-9]+$/
exports['style'] = /\s*(.+?):\s*([^;]+);?/g
exports['phone'] = /^\+(?:[0-9] ?){6,14}[0-9]$/
exports['utc-millisec'] = /^[0-9]+(\.?[0-9]+)?$/

},{}],56:[function(require,module,exports){
var genobj = require('generate-object-property')
var genfun = require('generate-function')
var jsonpointer = require('jsonpointer')
var xtend = require('xtend')
var formats = require('./formats')

var get = function(obj, additionalSchemas, ptr) {
  if (/^https?:\/\//.test(ptr)) return null

  var visit = function(sub) {
    if (sub && sub.id === ptr) return sub
    if (typeof sub !== 'object' || !sub) return null
    return Object.keys(sub).reduce(function(res, k) {
      return res || visit(sub[k])
    }, null)
  }

  var res = visit(obj)
  if (res) return res

  ptr = ptr.replace(/^#/, '')
  ptr = ptr.replace(/\/$/, '')

  try {
    return jsonpointer.get(obj, decodeURI(ptr))
  } catch (err) {
    var end = ptr.indexOf('#')
    var other
    // external reference
    if (end !== 0) {
      // fragment doesn't exist.
      if (end === -1) {
        other = additionalSchemas[ptr]
      } else {
        var ext = ptr.slice(0, end)
        other = additionalSchemas[ext]
        var fragment = ptr.slice(end).replace(/^#/, '')
        try {
          return jsonpointer.get(other, fragment)
        } catch (err) {}
      }
    } else {
      other = additionalSchemas[ptr]
    }
    return other || null
  }
}

var formatName = function(field) {
  field = JSON.stringify(field)
  var pattern = /\[([^\[\]"]+)\]/
  while (pattern.test(field)) field = field.replace(pattern, '."+$1+"')
  return field
}

var types = {}

types.any = function() {
  return 'true'
}

types.null = function(name) {
  return name+' === null'
}

types.boolean = function(name) {
  return 'typeof '+name+' === "boolean"'
}

types.array = function(name) {
  return 'Array.isArray('+name+')'
}

types.object = function(name) {
  return 'typeof '+name+' === "object" && '+name+' && !Array.isArray('+name+')'
}

types.number = function(name) {
  return 'typeof '+name+' === "number"'
}

types.integer = function(name) {
  return 'typeof '+name+' === "number" && (Math.floor('+name+') === '+name+' || '+name+' > 9007199254740992 || '+name+' < -9007199254740992)'
}

types.string = function(name) {
  return 'typeof '+name+' === "string"'
}

var unique = function(array) {
  var list = []
  for (var i = 0; i < array.length; i++) {
    list.push(typeof array[i] === 'object' ? JSON.stringify(array[i]) : array[i])
  }
  for (var i = 1; i < list.length; i++) {
    if (list.indexOf(list[i]) !== i) return false
  }
  return true
}

var toType = function(node) {
  return node.type
}

var compile = function(schema, cache, root, reporter, opts) {
  var fmts = opts ? xtend(formats, opts.formats) : formats
  var scope = {unique:unique, formats:fmts}
  var verbose = opts ? !!opts.verbose : false;
  var greedy = opts && opts.greedy !== undefined ?
    opts.greedy : false;

  var syms = {}
  var gensym = function(name) {
    return name+(syms[name] = (syms[name] || 0)+1)
  }

  var reversePatterns = {}
  var patterns = function(p) {
    if (reversePatterns[p]) return reversePatterns[p]
    var n = gensym('pattern')
    scope[n] = new RegExp(p)
    reversePatterns[p] = n
    return n
  }

  var vars = ['i','j','k','l','m','n','o','p','q','r','s','t','u','v','x','y','z']
  var genloop = function() {
    var v = vars.shift()
    vars.push(v+v[0])
    return v
  }

  var visit = function(name, node, reporter, filter) {
    var properties = node.properties
    var type = node.type
    var tuple = false

    if (Array.isArray(node.items)) { // tuple type
      properties = {}
      node.items.forEach(function(item, i) {
        properties[i] = item
      })
      type = 'array'
      tuple = true
    }

    var indent = 0
    var error = function(msg, prop, value) {
      validate('errors++')
      if (reporter === true) {
        validate('if (validate.errors === null) validate.errors = []')
        if (verbose) {
          validate('validate.errors.push({field:%s,message:%s,value:%s})', formatName(prop || name), JSON.stringify(msg), value || name)
        } else {
          validate('validate.errors.push({field:%s,message:%s})', formatName(prop || name), JSON.stringify(msg))
        }
      }
    }

    if (node.required === true) {
      indent++
      validate('if (%s === undefined) {', name)
      error('is required')
      validate('} else {')
    } else {
      indent++
      validate('if (%s !== undefined) {', name)
    }

    var valid = [].concat(type)
      .map(function(t) {
        return types[t || 'any'](name)
      })
      .join(' || ') || 'true'

    if (valid !== 'true') {
      indent++
      validate('if (!(%s)) {', valid)
      error('is the wrong type')
      validate('} else {')
    }

    if (tuple) {
      if (node.additionalItems === false) {
        validate('if (%s.length > %d) {', name, node.items.length)
        error('has additional items')
        validate('}')
      } else if (node.additionalItems) {
        var i = genloop()
        validate('for (var %s = %d; %s < %s.length; %s++) {', i, node.items.length, i, name, i)
        visit(name+'['+i+']', node.additionalItems, reporter, filter)
        validate('}')
      }   
    }

    if (node.format && fmts[node.format]) {
      if (type !== 'string' && formats[node.format]) validate('if (%s) {', types.string(name))
      var n = gensym('format')
      scope[n] = fmts[node.format]

      if (typeof scope[n] === 'function') validate('if (!%s(%s)) {', n, name)
      else validate('if (!%s.test(%s)) {', n, name)
      error('must be '+node.format+' format')
      validate('}')
      if (type !== 'string' && formats[node.format]) validate('}')
    }

    if (Array.isArray(node.required)) {
      var isUndefined = function(req) {
        return genobj(name, req) + ' === undefined'
      }

      var checkRequired = function (req) {
        var prop = genobj(name, req);
        validate('if (%s === undefined) {', prop)
        error('is required', prop)
        validate('missing++')
        validate('}')
      }
      validate('if ((%s)) {', type !== 'object' ? types.object(name) : 'true')
      validate('var missing = 0')
      node.required.map(checkRequired)
      validate('}');
      if (!greedy) {
        validate('if (missing === 0) {')
        indent++
      }
    }

    if (node.uniqueItems) {
      if (type !== 'array') validate('if (%s) {', types.array(name))
      validate('if (!(unique(%s))) {', name)
      error('must be unique')
      validate('}')
      if (type !== 'array') validate('}')
    }

    if (node.enum) {
      var complex = node.enum.some(function(e) {
        return typeof e === 'object'
      })

      var compare = complex ?
        function(e) {
          return 'JSON.stringify('+name+')'+' !== JSON.stringify('+JSON.stringify(e)+')'
        } :
        function(e) {
          return name+' !== '+JSON.stringify(e)
        }

      validate('if (%s) {', node.enum.map(compare).join(' && ') || 'false')
      error('must be an enum value')
      validate('}')
    }

    if (node.dependencies) {
      if (type !== 'object') validate('if (%s) {', types.object(name))

      Object.keys(node.dependencies).forEach(function(key) {
        var deps = node.dependencies[key]
        if (typeof deps === 'string') deps = [deps]

        var exists = function(k) {
          return genobj(name, k) + ' !== undefined'
        }

        if (Array.isArray(deps)) {
          validate('if (%s !== undefined && !(%s)) {', genobj(name, key), deps.map(exists).join(' && ') || 'true')
          error('dependencies not set')
          validate('}')
        }
        if (typeof deps === 'object') {
          validate('if (%s !== undefined) {', genobj(name, key))
          visit(name, deps, reporter, filter)
          validate('}')
        }
      })

      if (type !== 'object') validate('}')
    }

    if (node.additionalProperties || node.additionalProperties === false) {
      if (type !== 'object') validate('if (%s) {', types.object(name))

      var i = genloop()
      var keys = gensym('keys')

      var toCompare = function(p) {
        return keys+'['+i+'] !== '+JSON.stringify(p)
      }

      var toTest = function(p) {
        return '!'+patterns(p)+'.test('+keys+'['+i+'])'
      }

      var additionalProp = Object.keys(properties || {}).map(toCompare)
        .concat(Object.keys(node.patternProperties || {}).map(toTest))
        .join(' && ') || 'true'

      validate('var %s = Object.keys(%s)', keys, name)
        ('for (var %s = 0; %s < %s.length; %s++) {', i, i, keys, i)
          ('if (%s) {', additionalProp)

      if (node.additionalProperties === false) {
        if (filter) validate('delete %s', name+'['+keys+'['+i+']]')
        error('has additional properties', null, JSON.stringify(name+'.') + ' + ' + keys + '['+i+']')
      } else {
        visit(name+'['+keys+'['+i+']]', node.additionalProperties, reporter, filter)
      }

      validate
          ('}')
        ('}')

      if (type !== 'object') validate('}')
    }

    if (node.$ref) {
      var sub = get(root, opts && opts.schemas || {}, node.$ref)
      if (sub) {
        var fn = cache[node.$ref]
        if (!fn) {
          cache[node.$ref] = function proxy(data) {
            return fn(data)
          }
          fn = compile(sub, cache, root, false, opts)
        }
        var n = gensym('ref')
        scope[n] = fn
        validate('if (!(%s(%s))) {', n, name)
        error('referenced schema does not match')
        validate('}')
      }
    }

    if (node.not) {
      var prev = gensym('prev')
      validate('var %s = errors', prev)
      visit(name, node.not, false, filter)
      validate('if (%s === errors) {', prev)
      error('negative schema matches')
      validate('} else {')
        ('errors = %s', prev)
      ('}')
    }

    if (node.items && !tuple) {
      if (type !== 'array') validate('if (%s) {', types.array(name))

      var i = genloop()
      validate('for (var %s = 0; %s < %s.length; %s++) {', i, i, name, i)
      visit(name+'['+i+']', node.items, reporter, filter)
      validate('}')

      if (type !== 'array') validate('}')
    }

    if (node.patternProperties) {
      if (type !== 'object') validate('if (%s) {', types.object(name))
      var keys = gensym('keys')
      var i = genloop()
      validate
        ('var %s = Object.keys(%s)', keys, name)
        ('for (var %s = 0; %s < %s.length; %s++) {', i, i, keys, i)

      Object.keys(node.patternProperties).forEach(function(key) {
        var p = patterns(key)
        validate('if (%s.test(%s)) {', p, keys+'['+i+']')
        visit(name+'['+keys+'['+i+']]', node.patternProperties[key], reporter, filter)
        validate('}')
      })

      validate('}')
      if (type !== 'object') validate('}')
    }

    if (node.pattern) {
      var p = patterns(node.pattern)
      if (type !== 'string') validate('if (%s) {', types.string(name))
      validate('if (!(%s.test(%s))) {', p, name)
      error('pattern mismatch')
      validate('}')
      if (type !== 'string') validate('}')
    }

    if (node.allOf) {
      node.allOf.forEach(function(sch) {
        visit(name, sch, reporter, filter)
      })
    }

    if (node.anyOf && node.anyOf.length) {
      var prev = gensym('prev')

      node.anyOf.forEach(function(sch, i) {
        if (i === 0) {
          validate('var %s = errors', prev)
        } else {          
          validate('if (errors !== %s) {', prev)
            ('errors = %s', prev)
        }
        visit(name, sch, false, false)
      })
      node.anyOf.forEach(function(sch, i) {
        if (i) validate('}')
      })
      validate('if (%s !== errors) {', prev)
      error('no schemas match')
      validate('}')
    }

    if (node.oneOf && node.oneOf.length) {
      var prev = gensym('prev')
      var passes = gensym('passes')

      validate
        ('var %s = errors', prev)
        ('var %s = 0', passes)

      node.oneOf.forEach(function(sch, i) {
        visit(name, sch, false, false)
        validate('if (%s === errors) {', prev)
          ('%s++', passes)
        ('} else {')
          ('errors = %s', prev)
        ('}')
      })

      validate('if (%s !== 1) {', passes)
      error('no (or more than one) schemas match')
      validate('}')
    }

    if (node.multipleOf !== undefined) {
      if (type !== 'number' && type !== 'integer') validate('if (%s) {', types.number(name))

      var factor = ((node.multipleOf | 0) !== node.multipleOf) ? Math.pow(10, node.multipleOf.toString().split('.').pop().length) : 1
      if (factor > 1) validate('if ((%d*%s) % %d) {', factor, name, factor*node.multipleOf)
      else validate('if (%s % %d) {', name, node.multipleOf)

      error('has a remainder')
      validate('}')

      if (type !== 'number' && type !== 'integer') validate('}')
    }

    if (node.maxProperties !== undefined) {
      if (type !== 'object') validate('if (%s) {', types.object(name))
      
      validate('if (Object.keys(%s).length > %d) {', name, node.maxProperties)
      error('has more properties than allowed')
      validate('}')

      if (type !== 'object') validate('}')
    }

    if (node.minProperties !== undefined) {
      if (type !== 'object') validate('if (%s) {', types.object(name))
      
      validate('if (Object.keys(%s).length < %d) {', name, node.minProperties)
      error('has less properties than allowed')
      validate('}')

      if (type !== 'object') validate('}')
    }

    if (node.maxItems !== undefined) {
      if (type !== 'array') validate('if (%s) {', types.array(name))
      
      validate('if (%s.length > %d) {', name, node.maxItems)
      error('has more items than allowed')
      validate('}')

      if (type !== 'array') validate('}')
    }

    if (node.minItems !== undefined) {
      if (type !== 'array') validate('if (%s) {', types.array(name))
      
      validate('if (%s.length < %d) {', name, node.minItems)
      error('has less items than allowed')
      validate('}')

      if (type !== 'array') validate('}')
    }

    if (node.maxLength !== undefined) {
      if (type !== 'string') validate('if (%s) {', types.string(name))

      validate('if (%s.length > %d) {', name, node.maxLength)
      error('has longer length than allowed')
      validate('}')

      if (type !== 'string') validate('}')
    }

    if (node.minLength !== undefined) {
      if (type !== 'string') validate('if (%s) {', types.string(name))

      validate('if (%s.length < %d) {', name, node.minLength)
      error('has less length than allowed')
      validate('}')

      if (type !== 'string') validate('}')
    }

    if (node.minimum !== undefined) {
      validate('if (%s %s %d) {', name, node.exclusiveMinimum ? '<=' : '<', node.minimum)
      error('is less than minimum')
      validate('}')
    }

    if (node.maximum !== undefined) {
      validate('if (%s %s %d) {', name, node.exclusiveMaximum ? '>=' : '>', node.maximum)
      error('is more than maximum')
      validate('}')
    }

    if (properties) {
      Object.keys(properties).forEach(function(p) {
        visit(genobj(name, p), properties[p], reporter, filter)
      })
    }

    while (indent--) validate('}')
  }

  var validate = genfun
    ('function validate(data) {')
      ('validate.errors = null')
      ('var errors = 0')

  visit('data', schema, reporter, opts && opts.filter)

  validate
      ('return errors === 0')
    ('}')

  validate = validate.toFunction(scope)
  validate.errors = null

  validate.__defineGetter__('error', function() {
    if (!validate.errors) return ''
    return validate.errors
      .map(function(err) {
        return err.field+' '+err.message
      })
      .join('\n')
  })

  validate.toJSON = function() {
    return schema
  }

  return validate
}

module.exports = function(schema, opts) {
  if (typeof schema === 'string') schema = JSON.parse(schema)
  return compile(schema, {}, schema, true, opts)
}

module.exports.filter = function(schema, opts) {
  var validate = module.exports(schema, xtend(opts, {filter: true}))
  return function(sch) {
    validate(sch)
    return sch
  }
}

},{"./formats":55,"generate-function":57,"generate-object-property":58,"jsonpointer":60,"xtend":61}],57:[function(require,module,exports){
var util = require('util')

var INDENT_START = /[\{\[]/
var INDENT_END = /[\}\]]/

module.exports = function() {
  var lines = []
  var indent = 0

  var push = function(str) {
    var spaces = ''
    while (spaces.length < indent*2) spaces += '  '
    lines.push(spaces+str)
  }

  var line = function(fmt) {
    if (!fmt) return line

    if (INDENT_END.test(fmt.trim()[0]) && INDENT_START.test(fmt[fmt.length-1])) {
      indent--
      push(util.format.apply(util, arguments))
      indent++
      return line
    }
    if (INDENT_START.test(fmt[fmt.length-1])) {
      push(util.format.apply(util, arguments))
      indent++
      return line
    }
    if (INDENT_END.test(fmt.trim()[0])) {
      indent--
      push(util.format.apply(util, arguments))
      return line
    }

    push(util.format.apply(util, arguments))
    return line
  }

  line.toString = function() {
    return lines.join('\n')
  }

  line.toFunction = function(scope) {
    var src = 'return ('+line.toString()+')'

    var keys = Object.keys(scope || {}).map(function(key) {
      return key
    })

    var vals = keys.map(function(key) {
      return scope[key]
    })

    return Function.apply(null, keys.concat(src)).apply(null, vals)
  }

  if (arguments.length) line.apply(null, arguments)

  return line
}

},{"util":undefined}],58:[function(require,module,exports){
var isProperty = require('is-property')

var gen = function(obj, prop) {
  return isProperty(prop) ? obj+'.'+prop : obj+'['+JSON.stringify(prop)+']'
}

gen.valid = isProperty
gen.property = function (prop) {
 return isProperty(prop) ? prop : JSON.stringify(prop)
}

module.exports = gen

},{"is-property":59}],59:[function(require,module,exports){
"use strict"
function isProperty(str) {
  return /^[$A-Z\_a-z\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc][$A-Z\_a-z\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc0-9\u0300-\u036f\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u0669\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u06f0-\u06f9\u0711\u0730-\u074a\u07a6-\u07b0\u07c0-\u07c9\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u08e4-\u08fe\u0900-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09cb-\u09cd\u09d7\u09e2\u09e3\u09e6-\u09ef\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b62\u0b63\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c01-\u0c03\u0c3e-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0c66-\u0c6f\u0c82\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0ce6-\u0cef\u0d02\u0d03\u0d3e-\u0d44\u0d46-\u0d48\u0d4a-\u0d4d\u0d57\u0d62\u0d63\u0d66-\u0d6f\u0d82\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2\u0df3\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0e50-\u0e59\u0eb1\u0eb4-\u0eb9\u0ebb\u0ebc\u0ec8-\u0ecd\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e\u0f3f\u0f71-\u0f84\u0f86\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102b-\u103e\u1040-\u1049\u1056-\u1059\u105e-\u1060\u1062-\u1064\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b4-\u17d3\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u18a9\u1920-\u192b\u1930-\u193b\u1946-\u194f\u19b0-\u19c0\u19c8\u19c9\u19d0-\u19d9\u1a17-\u1a1b\u1a55-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1b00-\u1b04\u1b34-\u1b44\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1b82\u1ba1-\u1bad\u1bb0-\u1bb9\u1be6-\u1bf3\u1c24-\u1c37\u1c40-\u1c49\u1c50-\u1c59\u1cd0-\u1cd2\u1cd4-\u1ce8\u1ced\u1cf2-\u1cf4\u1dc0-\u1de6\u1dfc-\u1dff\u200c\u200d\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua620-\ua629\ua66f\ua674-\ua67d\ua69f\ua6f0\ua6f1\ua802\ua806\ua80b\ua823-\ua827\ua880\ua881\ua8b4-\ua8c4\ua8d0-\ua8d9\ua8e0-\ua8f1\ua900-\ua909\ua926-\ua92d\ua947-\ua953\ua980-\ua983\ua9b3-\ua9c0\ua9d0-\ua9d9\uaa29-\uaa36\uaa43\uaa4c\uaa4d\uaa50-\uaa59\uaa7b\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uaaeb-\uaaef\uaaf5\uaaf6\uabe3-\uabea\uabec\uabed\uabf0-\uabf9\ufb1e\ufe00-\ufe0f\ufe20-\ufe26\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f]*$/.test(str)
}
module.exports = isProperty
},{}],60:[function(require,module,exports){
var console = require("console");

var untilde = function(str) {
  return str.replace(/~./g, function(m) {
    switch (m) {
      case "~0":
        return "~";
      case "~1":
        return "/";
    }
    throw("Invalid tilde escape: " + m);
  });
}

var traverse = function(obj, pointer, value) {
  // assert(isArray(pointer))
  var part = untilde(pointer.shift());
  if(typeof obj[part] === "undefined") {
    throw("Value for pointer '" + pointer + "' not found.");
    return;
  }
  if(pointer.length !== 0) { // keep traversin!
    return traverse(obj[part], pointer, value);
  }
  // we're done
  if(typeof value === "undefined") {
    // just reading
    return obj[part];
  }
  // set new value, return old value
  var old_value = obj[part];
  if(value === null) {
    delete obj[part];
  } else {
    obj[part] = value;
  }
  return old_value;
}

var validate_input = function(obj, pointer) {
  if(typeof obj !== "object") {
    throw("Invalid input object.");
  }

  if(pointer === "") {
    return [];
  }

  if(!pointer) {
    throw("Invalid JSON pointer.");
  }

  pointer = pointer.split("/");
  var first = pointer.shift();
  if (first !== "") {
    throw("Invalid JSON pointer.");
  }

  return pointer;
}

var get = function(obj, pointer) {
  pointer = validate_input(obj, pointer);
  if (pointer.length === 0) {
    return obj;
  }
  return traverse(obj, pointer);
}

var set = function(obj, pointer, value) {
  pointer = validate_input(obj, pointer);
  if (pointer.length === 0) {
    throw("Invalid JSON pointer for set.")
  }
  return traverse(obj, pointer, value);
}

exports.get = get
exports.set = set

},{"console":undefined}],61:[function(require,module,exports){
module.exports = extend

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],62:[function(require,module,exports){
// Load modules

var Url = require('url');
var Hoek = require('hoek');
var Cryptiles = require('cryptiles');
var Crypto = require('./crypto');
var Utils = require('./utils');


// Declare internals

var internals = {};


// Generate an Authorization header for a given request

/*
    uri: 'http://example.com/resource?a=b' or object from Url.parse()
    method: HTTP verb (e.g. 'GET', 'POST')
    options: {

        // Required

        credentials: {
            id: 'dh37fgj492je',
            key: 'aoijedoaijsdlaksjdl',
            algorithm: 'sha256'                                 // 'sha1', 'sha256'
        },

        // Optional

        ext: 'application-specific',                        // Application specific data sent via the ext attribute
        timestamp: Date.now(),                              // A pre-calculated timestamp
        nonce: '2334f34f',                                  // A pre-generated nonce
        localtimeOffsetMsec: 400,                           // Time offset to sync with server time (ignored if timestamp provided)
        payload: '{"some":"payload"}',                      // UTF-8 encoded string for body hash generation (ignored if hash provided)
        contentType: 'application/json',                    // Payload content-type (ignored if hash provided)
        hash: 'U4MKKSmiVxk37JCCrAVIjV=',                    // Pre-calculated payload hash
        app: '24s23423f34dx',                               // Oz application id
        dlg: '234sz34tww3sd'                                // Oz delegated-by application id
    }
*/

exports.header = function (uri, method, options) {

    var result = {
        field: '',
        artifacts: {}
    };

    // Validate inputs

    if (!uri || (typeof uri !== 'string' && typeof uri !== 'object') ||
        !method || typeof method !== 'string' ||
        !options || typeof options !== 'object') {

        result.err = 'Invalid argument type';
        return result;
    }

    // Application time

    var timestamp = options.timestamp || Utils.nowSecs(options.localtimeOffsetMsec);

    // Validate credentials

    var credentials = options.credentials;
    if (!credentials ||
        !credentials.id ||
        !credentials.key ||
        !credentials.algorithm) {

        result.err = 'Invalid credential object';
        return result;
    }

    if (Crypto.algorithms.indexOf(credentials.algorithm) === -1) {
        result.err = 'Unknown algorithm';
        return result;
    }

    // Parse URI

    if (typeof uri === 'string') {
        uri = Url.parse(uri);
    }

    // Calculate signature

    var artifacts = {
        ts: timestamp,
        nonce: options.nonce || Cryptiles.randomString(6),
        method: method,
        resource: uri.pathname + (uri.search || ''),                            // Maintain trailing '?'
        host: uri.hostname,
        port: uri.port || (uri.protocol === 'http:' ? 80 : 443),
        hash: options.hash,
        ext: options.ext,
        app: options.app,
        dlg: options.dlg
    };

    result.artifacts = artifacts;

    // Calculate payload hash

    if (!artifacts.hash &&
        (options.payload || options.payload === '')) {

        artifacts.hash = Crypto.calculatePayloadHash(options.payload, credentials.algorithm, options.contentType);
    }

    var mac = Crypto.calculateMac('header', credentials, artifacts);

    // Construct header

    var hasExt = artifacts.ext !== null && artifacts.ext !== undefined && artifacts.ext !== '';       // Other falsey values allowed
    var header = 'Hawk id="' + credentials.id +
                 '", ts="' + artifacts.ts +
                 '", nonce="' + artifacts.nonce +
                 (artifacts.hash ? '", hash="' + artifacts.hash : '') +
                 (hasExt ? '", ext="' + Hoek.escapeHeaderAttribute(artifacts.ext) : '') +
                 '", mac="' + mac + '"';

    if (artifacts.app) {
        header += ', app="' + artifacts.app +
                  (artifacts.dlg ? '", dlg="' + artifacts.dlg : '') + '"';
    }

    result.field = header;

    return result;
};


// Validate server response

/*
    res:        node's response object
    artifacts:  object received from header().artifacts
    options: {
        payload:    optional payload received
        required:   specifies if a Server-Authorization header is required. Defaults to 'false'
    }
*/

exports.authenticate = function (res, credentials, artifacts, options) {

    artifacts = Hoek.clone(artifacts);
    options = options || {};

    if (res.headers['www-authenticate']) {

        // Parse HTTP WWW-Authenticate header

        var wwwAttributes = Utils.parseAuthorizationHeader(res.headers['www-authenticate'], ['ts', 'tsm', 'error']);
        if (wwwAttributes instanceof Error) {
            return false;
        }

        // Validate server timestamp (not used to update clock since it is done via the SNPT client)

        if (wwwAttributes.ts) {
            var tsm = Crypto.calculateTsMac(wwwAttributes.ts, credentials);
            if (tsm !== wwwAttributes.tsm) {
                return false;
            }
        }
    }

    // Parse HTTP Server-Authorization header

    if (!res.headers['server-authorization'] &&
        !options.required) {

        return true;
    }

    var attributes = Utils.parseAuthorizationHeader(res.headers['server-authorization'], ['mac', 'ext', 'hash']);
    if (attributes instanceof Error) {
        return false;
    }

    artifacts.ext = attributes.ext;
    artifacts.hash = attributes.hash;

    var mac = Crypto.calculateMac('response', credentials, artifacts);
    if (mac !== attributes.mac) {
        return false;
    }

    if (!options.payload &&
        options.payload !== '') {

        return true;
    }

    if (!attributes.hash) {
        return false;
    }

    var calculatedHash = Crypto.calculatePayloadHash(options.payload, credentials.algorithm, res.headers['content-type']);
    return (calculatedHash === attributes.hash);
};


// Generate a bewit value for a given URI

/*
    uri: 'http://example.com/resource?a=b' or object from Url.parse()
    options: {

        // Required

        credentials: {
            id: 'dh37fgj492je',
            key: 'aoijedoaijsdlaksjdl',
            algorithm: 'sha256'                             // 'sha1', 'sha256'
        },
        ttlSec: 60 * 60,                                    // TTL in seconds

        // Optional

        ext: 'application-specific',                        // Application specific data sent via the ext attribute
        localtimeOffsetMsec: 400                            // Time offset to sync with server time
    };
*/

exports.getBewit = function (uri, options) {

    // Validate inputs

    if (!uri ||
        (typeof uri !== 'string' && typeof uri !== 'object') ||
        !options ||
        typeof options !== 'object' ||
        !options.ttlSec) {

        return '';
    }

    options.ext = (options.ext === null || options.ext === undefined ? '' : options.ext);       // Zero is valid value

    // Application time

    var now = Utils.now(options.localtimeOffsetMsec);

    // Validate credentials

    var credentials = options.credentials;
    if (!credentials ||
        !credentials.id ||
        !credentials.key ||
        !credentials.algorithm) {

        return '';
    }

    if (Crypto.algorithms.indexOf(credentials.algorithm) === -1) {
        return '';
    }

    // Parse URI

    if (typeof uri === 'string') {
        uri = Url.parse(uri);
    }

    // Calculate signature

    var exp = Math.floor(now / 1000) + options.ttlSec;
    var mac = Crypto.calculateMac('bewit', credentials, {
        ts: exp,
        nonce: '',
        method: 'GET',
        resource: uri.pathname + (uri.search || ''),                            // Maintain trailing '?'
        host: uri.hostname,
        port: uri.port || (uri.protocol === 'http:' ? 80 : 443),
        ext: options.ext
    });

    // Construct bewit: id\exp\mac\ext

    var bewit = credentials.id + '\\' + exp + '\\' + mac + '\\' + options.ext;
    return Hoek.base64urlEncode(bewit);
};


// Generate an authorization string for a message

/*
    host: 'example.com',
    port: 8000,
    message: '{"some":"payload"}',                          // UTF-8 encoded string for body hash generation
    options: {

        // Required

        credentials: {
            id: 'dh37fgj492je',
            key: 'aoijedoaijsdlaksjdl',
            algorithm: 'sha256'                             // 'sha1', 'sha256'
        },

        // Optional

        timestamp: Date.now(),                              // A pre-calculated timestamp
        nonce: '2334f34f',                                  // A pre-generated nonce
        localtimeOffsetMsec: 400,                           // Time offset to sync with server time (ignored if timestamp provided)
    }
*/

exports.message = function (host, port, message, options) {

    // Validate inputs

    if (!host || typeof host !== 'string' ||
        !port || typeof port !== 'number' ||
        message === null || message === undefined || typeof message !== 'string' ||
        !options || typeof options !== 'object') {

        return null;
    }

    // Application time

    var timestamp = options.timestamp || Utils.nowSecs(options.localtimeOffsetMsec);

    // Validate credentials

    var credentials = options.credentials;
    if (!credentials ||
        !credentials.id ||
        !credentials.key ||
        !credentials.algorithm) {

        // Invalid credential object
        return null;
    }

    if (Crypto.algorithms.indexOf(credentials.algorithm) === -1) {
        return null;
    }

    // Calculate signature

    var artifacts = {
        ts: timestamp,
        nonce: options.nonce || Cryptiles.randomString(6),
        host: host,
        port: port,
        hash: Crypto.calculatePayloadHash(message, credentials.algorithm)
    };

    // Construct authorization

    var result = {
        id: credentials.id,
        ts: artifacts.ts,
        nonce: artifacts.nonce,
        hash: artifacts.hash,
        mac: Crypto.calculateMac('message', credentials, artifacts)
    };

    return result;
};




},{"./crypto":63,"./utils":66,"cryptiles":68,"hoek":70,"url":undefined}],63:[function(require,module,exports){
// Load modules

var Crypto = require('crypto');
var Url = require('url');
var Utils = require('./utils');


// Declare internals

var internals = {};


// MAC normalization format version

exports.headerVersion = '1';                        // Prevent comparison of mac values generated with different normalized string formats


// Supported HMAC algorithms

exports.algorithms = ['sha1', 'sha256'];


// Calculate the request MAC

/*
    type: 'header',                                 // 'header', 'bewit', 'response'
    credentials: {
        key: 'aoijedoaijsdlaksjdl',
        algorithm: 'sha256'                         // 'sha1', 'sha256'
    },
    options: {
        method: 'GET',
        resource: '/resource?a=1&b=2',
        host: 'example.com',
        port: 8080,
        ts: 1357718381034,
        nonce: 'd3d345f',
        hash: 'U4MKKSmiVxk37JCCrAVIjV/OhB3y+NdwoCr6RShbVkE=',
        ext: 'app-specific-data',
        app: 'hf48hd83qwkj',                        // Application id (Oz)
        dlg: 'd8djwekds9cj'                         // Delegated by application id (Oz), requires options.app
    }
*/

exports.calculateMac = function (type, credentials, options) {

    var normalized = exports.generateNormalizedString(type, options);

    var hmac = Crypto.createHmac(credentials.algorithm, credentials.key).update(normalized);
    var digest = hmac.digest('base64');
    return digest;
};


exports.generateNormalizedString = function (type, options) {

    var resource = options.resource || '';
    if (resource &&
        resource[0] !== '/') {

        var url = Url.parse(resource, false);
        resource = url.path;                        // Includes query
    }

    var normalized = 'hawk.' + exports.headerVersion + '.' + type + '\n' +
                     options.ts + '\n' +
                     options.nonce + '\n' +
                     (options.method || '').toUpperCase() + '\n' +
                     resource + '\n' +
                     options.host.toLowerCase() + '\n' +
                     options.port + '\n' +
                     (options.hash || '') + '\n';

    if (options.ext) {
        normalized += options.ext.replace('\\', '\\\\').replace('\n', '\\n');
    }

    normalized += '\n';

    if (options.app) {
        normalized += options.app + '\n' +
                      (options.dlg || '') + '\n';
    }

    return normalized;
};


exports.calculatePayloadHash = function (payload, algorithm, contentType) {

    var hash = exports.initializePayloadHash(algorithm, contentType);
    hash.update(payload || '');
    return exports.finalizePayloadHash(hash);
};


exports.initializePayloadHash = function (algorithm, contentType) {

    var hash = Crypto.createHash(algorithm);
    hash.update('hawk.' + exports.headerVersion + '.payload\n');
    hash.update(Utils.parseContentType(contentType) + '\n');
    return hash;
};


exports.finalizePayloadHash = function (hash) {

    hash.update('\n');
    return hash.digest('base64');
};


exports.calculateTsMac = function (ts, credentials) {

    var hmac = Crypto.createHmac(credentials.algorithm, credentials.key);
    hmac.update('hawk.' + exports.headerVersion + '.ts\n' + ts + '\n');
    return hmac.digest('base64');
};


exports.timestampMessage = function (credentials, localtimeOffsetMsec) {

    var now = Utils.nowSecs(localtimeOffsetMsec);
    var tsm = exports.calculateTsMac(now, credentials);
    return { ts: now, tsm: tsm };
};

},{"./utils":66,"crypto":undefined,"url":undefined}],64:[function(require,module,exports){
// Export sub-modules

exports.error = exports.Error = require('boom');
exports.sntp = require('sntp');

exports.server = require('./server');
exports.client = require('./client');
exports.crypto = require('./crypto');
exports.utils = require('./utils');

exports.uri = {
    authenticate: exports.server.authenticateBewit,
    getBewit: exports.client.getBewit
};


},{"./client":62,"./crypto":63,"./server":65,"./utils":66,"boom":67,"sntp":73}],65:[function(require,module,exports){
// Load modules

var Boom = require('boom');
var Hoek = require('hoek');
var Cryptiles = require('cryptiles');
var Crypto = require('./crypto');
var Utils = require('./utils');


// Declare internals

var internals = {};


// Hawk authentication

/*
   req:                 node's HTTP request object or an object as follows:

                        var request = {
                            method: 'GET',
                            url: '/resource/4?a=1&b=2',
                            host: 'example.com',
                            port: 8080,
                            authorization: 'Hawk id="dh37fgj492je", ts="1353832234", nonce="j4h3g2", ext="some-app-ext-data", mac="6R4rV5iE+NPoym+WwjeHzjAGXUtLNIxmo1vpMofpLAE="'
                        };

   credentialsFunc:     required function to lookup the set of Hawk credentials based on the provided credentials id.
                        The credentials include the MAC key, MAC algorithm, and other attributes (such as username)
                        needed by the application. This function is the equivalent of verifying the username and
                        password in Basic authentication.

                        var credentialsFunc = function (id, callback) {

                            // Lookup credentials in database
                            db.lookup(id, function (err, item) {

                                if (err || !item) {
                                    return callback(err);
                                }

                                var credentials = {
                                    // Required
                                    key: item.key,
                                    algorithm: item.algorithm,
                                    // Application specific
                                    user: item.user
                                };

                                return callback(null, credentials);
                            });
                        };

   options: {

        hostHeaderName:        optional header field name, used to override the default 'Host' header when used
                               behind a cache of a proxy. Apache2 changes the value of the 'Host' header while preserving
                               the original (which is what the module must verify) in the 'x-forwarded-host' header field.
                               Only used when passed a node Http.ServerRequest object.

        nonceFunc:             optional nonce validation function. The function signature is function(key, nonce, ts, callback)
                               where 'callback' must be called using the signature function(err).

        timestampSkewSec:      optional number of seconds of permitted clock skew for incoming timestamps. Defaults to 60 seconds.
                               Provides a +/- skew which means actual allowed window is double the number of seconds.

        localtimeOffsetMsec:   optional local clock time offset express in a number of milliseconds (positive or negative).
                               Defaults to 0.

        payload:               optional payload for validation. The client calculates the hash value and includes it via the 'hash'
                               header attribute. The server always ensures the value provided has been included in the request
                               MAC. When this option is provided, it validates the hash value itself. Validation is done by calculating
                               a hash value over the entire payload (assuming it has already be normalized to the same format and
                               encoding used by the client to calculate the hash on request). If the payload is not available at the time
                               of authentication, the authenticatePayload() method can be used by passing it the credentials and
                               attributes.hash returned in the authenticate callback.

        host:                  optional host name override. Only used when passed a node request object.
        port:                  optional port override. Only used when passed a node request object.
    }

    callback: function (err, credentials, artifacts) { }
 */

exports.authenticate = function (req, credentialsFunc, options, callback) {

    callback = Hoek.nextTick(callback);

    // Default options

    options.nonceFunc = options.nonceFunc || internals.nonceFunc;
    options.timestampSkewSec = options.timestampSkewSec || 60;                                                  // 60 seconds

    // Application time

    var now = Utils.now(options.localtimeOffsetMsec);                           // Measure now before any other processing

    // Convert node Http request object to a request configuration object

    var request = Utils.parseRequest(req, options);
    if (request instanceof Error) {
        return callback(Boom.badRequest(request.message));
    }

    // Parse HTTP Authorization header

    var attributes = Utils.parseAuthorizationHeader(request.authorization);
    if (attributes instanceof Error) {
        return callback(attributes);
    }

    // Construct artifacts container

    var artifacts = {
        method: request.method,
        host: request.host,
        port: request.port,
        resource: request.url,
        ts: attributes.ts,
        nonce: attributes.nonce,
        hash: attributes.hash,
        ext: attributes.ext,
        app: attributes.app,
        dlg: attributes.dlg,
        mac: attributes.mac,
        id: attributes.id
    };

    // Verify required header attributes

    if (!attributes.id ||
        !attributes.ts ||
        !attributes.nonce ||
        !attributes.mac) {

        return callback(Boom.badRequest('Missing attributes'), null, artifacts);
    }

    // Fetch Hawk credentials

    credentialsFunc(attributes.id, function (err, credentials) {

        if (err) {
            return callback(err, credentials || null, artifacts);
        }

        if (!credentials) {
            return callback(Boom.unauthorized('Unknown credentials', 'Hawk'), null, artifacts);
        }

        if (!credentials.key ||
            !credentials.algorithm) {

            return callback(Boom.internal('Invalid credentials'), credentials, artifacts);
        }

        if (Crypto.algorithms.indexOf(credentials.algorithm) === -1) {
            return callback(Boom.internal('Unknown algorithm'), credentials, artifacts);
        }

        // Calculate MAC

        var mac = Crypto.calculateMac('header', credentials, artifacts);
        if (!Cryptiles.fixedTimeComparison(mac, attributes.mac)) {
            return callback(Boom.unauthorized('Bad mac', 'Hawk'), credentials, artifacts);
        }

        // Check payload hash

        if (options.payload ||
            options.payload === '') {

            if (!attributes.hash) {
                return callback(Boom.unauthorized('Missing required payload hash', 'Hawk'), credentials, artifacts);
            }

            var hash = Crypto.calculatePayloadHash(options.payload, credentials.algorithm, request.contentType);
            if (!Cryptiles.fixedTimeComparison(hash, attributes.hash)) {
                return callback(Boom.unauthorized('Bad payload hash', 'Hawk'), credentials, artifacts);
            }
        }

        // Check nonce

        options.nonceFunc(credentials.key, attributes.nonce, attributes.ts, function (err) {

            if (err) {
                return callback(Boom.unauthorized('Invalid nonce', 'Hawk'), credentials, artifacts);
            }

            // Check timestamp staleness

            if (Math.abs((attributes.ts * 1000) - now) > (options.timestampSkewSec * 1000)) {
                var tsm = Crypto.timestampMessage(credentials, options.localtimeOffsetMsec);
                return callback(Boom.unauthorized('Stale timestamp', 'Hawk', tsm), credentials, artifacts);
            }

            // Successful authentication

            return callback(null, credentials, artifacts);
        });
    });
};


// Authenticate payload hash - used when payload cannot be provided during authenticate()

/*
    payload:        raw request payload
    credentials:    from authenticate callback
    artifacts:      from authenticate callback
    contentType:    req.headers['content-type']
*/

exports.authenticatePayload = function (payload, credentials, artifacts, contentType) {

    var calculatedHash = Crypto.calculatePayloadHash(payload, credentials.algorithm, contentType);
    return Cryptiles.fixedTimeComparison(calculatedHash, artifacts.hash);
};


// Authenticate payload hash - used when payload cannot be provided during authenticate()

/*
    calculatedHash: the payload hash calculated using Crypto.calculatePayloadHash()
    artifacts:      from authenticate callback
*/

exports.authenticatePayloadHash = function (calculatedHash, artifacts) {

    return Cryptiles.fixedTimeComparison(calculatedHash, artifacts.hash);
};


// Generate a Server-Authorization header for a given response

/*
    credentials: {},                                        // Object received from authenticate()
    artifacts: {}                                           // Object received from authenticate(); 'mac', 'hash', and 'ext' - ignored
    options: {
        ext: 'application-specific',                        // Application specific data sent via the ext attribute
        payload: '{"some":"payload"}',                      // UTF-8 encoded string for body hash generation (ignored if hash provided)
        contentType: 'application/json',                    // Payload content-type (ignored if hash provided)
        hash: 'U4MKKSmiVxk37JCCrAVIjV='                     // Pre-calculated payload hash
    }
*/

exports.header = function (credentials, artifacts, options) {

    // Prepare inputs

    options = options || {};

    if (!artifacts ||
        typeof artifacts !== 'object' ||
        typeof options !== 'object') {

        return '';
    }

    artifacts = Hoek.clone(artifacts);
    delete artifacts.mac;
    artifacts.hash = options.hash;
    artifacts.ext = options.ext;

    // Validate credentials

    if (!credentials ||
        !credentials.key ||
        !credentials.algorithm) {

        // Invalid credential object
        return '';
    }

    if (Crypto.algorithms.indexOf(credentials.algorithm) === -1) {
        return '';
    }

    // Calculate payload hash

    if (!artifacts.hash &&
        (options.payload || options.payload === '')) {

        artifacts.hash = Crypto.calculatePayloadHash(options.payload, credentials.algorithm, options.contentType);
    }

    var mac = Crypto.calculateMac('response', credentials, artifacts);

    // Construct header

    var header = 'Hawk mac="' + mac + '"' +
                 (artifacts.hash ? ', hash="' + artifacts.hash + '"' : '');

    if (artifacts.ext !== null &&
        artifacts.ext !== undefined &&
        artifacts.ext !== '') {                       // Other falsey values allowed

        header += ', ext="' + Hoek.escapeHeaderAttribute(artifacts.ext) + '"';
    }

    return header;
};


/*
 * Arguments and options are the same as authenticate() with the exception that the only supported options are:
 * 'hostHeaderName', 'localtimeOffsetMsec', 'host', 'port'
 */

exports.authenticateBewit = function (req, credentialsFunc, options, callback) {

    callback = Hoek.nextTick(callback);

    // Application time

    var now = Utils.now(options.localtimeOffsetMsec);

    // Convert node Http request object to a request configuration object

    var request = Utils.parseRequest(req, options);
    if (request instanceof Error) {
        return callback(Boom.badRequest(request.message));
    }

    // Extract bewit

    //                                 1     2             3           4
    var resource = request.url.match(/^(\/.*)([\?&])bewit\=([^&$]*)(?:&(.+))?$/);
    if (!resource) {
        return callback(Boom.unauthorized(null, 'Hawk'));
    }

    // Bewit not empty

    if (!resource[3]) {
        return callback(Boom.unauthorized('Empty bewit', 'Hawk'));
    }

    // Verify method is GET

    if (request.method !== 'GET' &&
        request.method !== 'HEAD') {

        return callback(Boom.unauthorized('Invalid method', 'Hawk'));
    }

    // No other authentication

    if (request.authorization) {
        return callback(Boom.badRequest('Multiple authentications'));
    }

    // Parse bewit

    var bewitString = Hoek.base64urlDecode(resource[3]);
    if (bewitString instanceof Error) {
        return callback(Boom.badRequest('Invalid bewit encoding'));
    }

    // Bewit format: id\exp\mac\ext ('\' is used because it is a reserved header attribute character)

    var bewitParts = bewitString.split('\\');
    if (bewitParts.length !== 4) {
        return callback(Boom.badRequest('Invalid bewit structure'));
    }

    var bewit = {
        id: bewitParts[0],
        exp: parseInt(bewitParts[1], 10),
        mac: bewitParts[2],
        ext: bewitParts[3] || ''
    };

    if (!bewit.id ||
        !bewit.exp ||
        !bewit.mac) {

        return callback(Boom.badRequest('Missing bewit attributes'));
    }

    // Construct URL without bewit

    var url = resource[1];
    if (resource[4]) {
        url += resource[2] + resource[4];
    }

    // Check expiration

    if (bewit.exp * 1000 <= now) {
        return callback(Boom.unauthorized('Access expired', 'Hawk'), null, bewit);
    }

    // Fetch Hawk credentials

    credentialsFunc(bewit.id, function (err, credentials) {

        if (err) {
            return callback(err, credentials || null, bewit.ext);
        }

        if (!credentials) {
            return callback(Boom.unauthorized('Unknown credentials', 'Hawk'), null, bewit);
        }

        if (!credentials.key ||
            !credentials.algorithm) {

            return callback(Boom.internal('Invalid credentials'), credentials, bewit);
        }

        if (Crypto.algorithms.indexOf(credentials.algorithm) === -1) {
            return callback(Boom.internal('Unknown algorithm'), credentials, bewit);
        }

        // Calculate MAC

        var mac = Crypto.calculateMac('bewit', credentials, {
            ts: bewit.exp,
            nonce: '',
            method: 'GET',
            resource: url,
            host: request.host,
            port: request.port,
            ext: bewit.ext
        });

        if (!Cryptiles.fixedTimeComparison(mac, bewit.mac)) {
            return callback(Boom.unauthorized('Bad mac', 'Hawk'), credentials, bewit);
        }

        // Successful authentication

        return callback(null, credentials, bewit);
    });
};


/*
 *  options are the same as authenticate() with the exception that the only supported options are:
 * 'nonceFunc', 'timestampSkewSec', 'localtimeOffsetMsec'
 */

exports.authenticateMessage = function (host, port, message, authorization, credentialsFunc, options, callback) {

    callback = Hoek.nextTick(callback);

    // Default options

    options.nonceFunc = options.nonceFunc || internals.nonceFunc;
    options.timestampSkewSec = options.timestampSkewSec || 60;                                                  // 60 seconds

    // Application time

    var now = Utils.now(options.localtimeOffsetMsec);                       // Measure now before any other processing

    // Validate authorization

    if (!authorization.id ||
        !authorization.ts ||
        !authorization.nonce ||
        !authorization.hash ||
        !authorization.mac) {

        return callback(Boom.badRequest('Invalid authorization'));
    }

    // Fetch Hawk credentials

    credentialsFunc(authorization.id, function (err, credentials) {

        if (err) {
            return callback(err, credentials || null);
        }

        if (!credentials) {
            return callback(Boom.unauthorized('Unknown credentials', 'Hawk'));
        }

        if (!credentials.key ||
            !credentials.algorithm) {

            return callback(Boom.internal('Invalid credentials'), credentials);
        }

        if (Crypto.algorithms.indexOf(credentials.algorithm) === -1) {
            return callback(Boom.internal('Unknown algorithm'), credentials);
        }

        // Construct artifacts container

        var artifacts = {
            ts: authorization.ts,
            nonce: authorization.nonce,
            host: host,
            port: port,
            hash: authorization.hash
        };

        // Calculate MAC

        var mac = Crypto.calculateMac('message', credentials, artifacts);
        if (!Cryptiles.fixedTimeComparison(mac, authorization.mac)) {
            return callback(Boom.unauthorized('Bad mac', 'Hawk'), credentials);
        }

        // Check payload hash

        var hash = Crypto.calculatePayloadHash(message, credentials.algorithm);
        if (!Cryptiles.fixedTimeComparison(hash, authorization.hash)) {
            return callback(Boom.unauthorized('Bad message hash', 'Hawk'), credentials);
        }

        // Check nonce

        options.nonceFunc(credentials.key, authorization.nonce, authorization.ts, function (err) {

            if (err) {
                return callback(Boom.unauthorized('Invalid nonce', 'Hawk'), credentials);
            }

            // Check timestamp staleness

            if (Math.abs((authorization.ts * 1000) - now) > (options.timestampSkewSec * 1000)) {
                return callback(Boom.unauthorized('Stale timestamp'), credentials);
            }

            // Successful authentication

            return callback(null, credentials);
        });
    });
};


internals.nonceFunc = function (key, nonce, ts, nonceCallback) {

    return nonceCallback();         // No validation
};

},{"./crypto":63,"./utils":66,"boom":67,"cryptiles":68,"hoek":70}],66:[function(require,module,exports){
// Load modules

var Sntp = require('sntp');
var Boom = require('boom');


// Declare internals

var internals = {};


exports.version = function () {

    return require('../package.json').version;
};


// Extract host and port from request

//                                            $1                            $2
internals.hostHeaderRegex = /^(?:(?:\r\n)?\s)*((?:[^:]+)|(?:\[[^\]]+\]))(?::(\d+))?(?:(?:\r\n)?\s)*$/;              // (IPv4, hostname)|(IPv6)


exports.parseHost = function (req, hostHeaderName) {

    hostHeaderName = (hostHeaderName ? hostHeaderName.toLowerCase() : 'host');
    var hostHeader = req.headers[hostHeaderName];
    if (!hostHeader) {
        return null;
    }

    var hostParts = hostHeader.match(internals.hostHeaderRegex);
    if (!hostParts) {
        return null;
    }

    return {
        name: hostParts[1],
        port: (hostParts[2] ? hostParts[2] : (req.connection && req.connection.encrypted ? 443 : 80))
    };
};


// Parse Content-Type header content

exports.parseContentType = function (header) {

    if (!header) {
        return '';
    }

    return header.split(';')[0].trim().toLowerCase();
};


// Convert node's  to request configuration object

exports.parseRequest = function (req, options) {

    if (!req.headers) {
        return req;
    }

    // Obtain host and port information

    if (!options.host || !options.port) {
        var host = exports.parseHost(req, options.hostHeaderName);
        if (!host) {
            return new Error('Invalid Host header');
        }
    }

    var request = {
        method: req.method,
        url: req.url,
        host: options.host || host.name,
        port: options.port || host.port,
        authorization: req.headers.authorization,
        contentType: req.headers['content-type'] || ''
    };

    return request;
};


exports.now = function (localtimeOffsetMsec) {

    return Sntp.now() + (localtimeOffsetMsec || 0);
};


exports.nowSecs = function (localtimeOffsetMsec) {

    return Math.floor(exports.now(localtimeOffsetMsec) / 1000);
};


// Parse Hawk HTTP Authorization header

exports.parseAuthorizationHeader = function (header, keys) {

    keys = keys || ['id', 'ts', 'nonce', 'hash', 'ext', 'mac', 'app', 'dlg'];

    if (!header) {
        return Boom.unauthorized(null, 'Hawk');
    }

    var headerParts = header.match(/^(\w+)(?:\s+(.*))?$/);       // Header: scheme[ something]
    if (!headerParts) {
        return Boom.badRequest('Invalid header syntax');
    }

    var scheme = headerParts[1];
    if (scheme.toLowerCase() !== 'hawk') {
        return Boom.unauthorized(null, 'Hawk');
    }

    var attributesString = headerParts[2];
    if (!attributesString) {
        return Boom.badRequest('Invalid header syntax');
    }

    var attributes = {};
    var errorMessage = '';
    var verify = attributesString.replace(/(\w+)="([^"\\]*)"\s*(?:,\s*|$)/g, function ($0, $1, $2) {

        // Check valid attribute names

        if (keys.indexOf($1) === -1) {
            errorMessage = 'Unknown attribute: ' + $1;
            return;
        }

        // Allowed attribute value characters: !#$%&'()*+,-./:;<=>?@[]^_`{|}~ and space, a-z, A-Z, 0-9

        if ($2.match(/^[ \w\!#\$%&'\(\)\*\+,\-\.\/\:;<\=>\?@\[\]\^`\{\|\}~]+$/) === null) {
            errorMessage = 'Bad attribute value: ' + $1;
            return;
        }

        // Check for duplicates

        if (attributes.hasOwnProperty($1)) {
            errorMessage = 'Duplicate attribute: ' + $1;
            return;
        }

        attributes[$1] = $2;
        return '';
    });

    if (verify !== '') {
        return Boom.badRequest(errorMessage || 'Bad header format');
    }

    return attributes;
};


exports.unauthorized = function (message, attributes) {

    return Boom.unauthorized(message, 'Hawk', attributes);
};


},{"../package.json":75,"boom":67,"sntp":73}],67:[function(require,module,exports){
// Load modules

var Http = require('http');
var Hoek = require('hoek');


// Declare internals

var internals = {};


exports.wrap = function (error, statusCode, message) {

    Hoek.assert(error instanceof Error, 'Cannot wrap non-Error object');
    return (error.isBoom ? error : internals.initialize(error, statusCode || 500, message));
};


exports.create = function (statusCode, message, data) {

    var error = new Error(message ? message : undefined);       // Avoids settings null message
    error.data = data || null;
    internals.initialize(error, statusCode);
    return error;
};


internals.initialize = function (error, statusCode, message) {

    var numberCode = parseInt(statusCode, 10);
    Hoek.assert(!isNaN(numberCode) && numberCode >= 400, 'First argument must be a number (400+):', statusCode);

    error.isBoom = true;
    error.isServer = numberCode >= 500;

    if (!error.hasOwnProperty('data')) {
        error.data = null;
    }

    error.output = {
        statusCode: numberCode,
        payload: {},
        headers: {}
    };

    error.reformat = internals.reformat;
    error.reformat();

    if (!message &&
        !error.message) {

        message = error.output.payload.error;
    }

    if (message) {
        error.message = (message + (error.message ? ': ' + error.message : ''));
    }

    return error;
};


internals.reformat = function () {

    this.output.payload.statusCode = this.output.statusCode;
    this.output.payload.error = Http.STATUS_CODES[this.output.statusCode] || 'Unknown';

    if (this.output.statusCode === 500) {
        this.output.payload.message = 'An internal server error occurred';              // Hide actual error from user
    }
    else if (this.message) {
        this.output.payload.message = this.message;
    }
};


// 4xx Client Errors

exports.badRequest = function (message, data) {

    return exports.create(400, message, data);
};


exports.unauthorized = function (message, scheme, attributes) {          // Or function (message, wwwAuthenticate[])

    var err = exports.create(401, message);

    if (!scheme) {
        return err;
    }

    var wwwAuthenticate = '';
    var i = 0;
    var il = 0;

    if (typeof scheme === 'string') {

        // function (message, scheme, attributes)

        wwwAuthenticate = scheme;

        if (attributes || message) {
            err.output.payload.attributes = {};
        }

        if (attributes) {
            var names = Object.keys(attributes);
            for (i = 0, il = names.length; i < il; ++i) {
                var name = names[i];
                if (i) {
                    wwwAuthenticate += ',';
                }

                var value = attributes[name];
                if (value === null ||
                    value === undefined) {              // Value can be zero

                    value = '';
                }
                wwwAuthenticate += ' ' + name + '="' + Hoek.escapeHeaderAttribute(value.toString()) + '"';
                err.output.payload.attributes[name] = value;
            }
        }

        if (message) {
            if (attributes) {
                wwwAuthenticate += ',';
            }
            wwwAuthenticate += ' error="' + Hoek.escapeHeaderAttribute(message) + '"';
            err.output.payload.attributes.error = message;
        }
        else {
            err.isMissing = true;
        }
    }
    else {

        // function (message, wwwAuthenticate[])

        var wwwArray = scheme;
        for (i = 0, il = wwwArray.length; i < il; ++i) {
            if (i) {
                wwwAuthenticate += ', ';
            }

            wwwAuthenticate += wwwArray[i];
        }
    }

    err.output.headers['WWW-Authenticate'] = wwwAuthenticate;

    return err;
};


exports.forbidden = function (message, data) {

    return exports.create(403, message, data);
};


exports.notFound = function (message, data) {

    return exports.create(404, message, data);
};


exports.methodNotAllowed = function (message, data) {

    return exports.create(405, message, data);
};


exports.notAcceptable = function (message, data) {

    return exports.create(406, message, data);
};


exports.proxyAuthRequired = function (message, data) {

    return exports.create(407, message, data);
};


exports.clientTimeout = function (message, data) {

    return exports.create(408, message, data);
};


exports.conflict = function (message, data) {

    return exports.create(409, message, data);
};


exports.resourceGone = function (message, data) {

    return exports.create(410, message, data);
};


exports.lengthRequired = function (message, data) {

    return exports.create(411, message, data);
};


exports.preconditionFailed = function (message, data) {

    return exports.create(412, message, data);
};


exports.entityTooLarge = function (message, data) {

    return exports.create(413, message, data);
};


exports.uriTooLong = function (message, data) {

    return exports.create(414, message, data);
};


exports.unsupportedMediaType = function (message, data) {

    return exports.create(415, message, data);
};


exports.rangeNotSatisfiable = function (message, data) {

    return exports.create(416, message, data);
};


exports.expectationFailed = function (message, data) {

    return exports.create(417, message, data);
};

exports.badData = function (message, data) {

    return exports.create(422, message, data);
};


exports.tooManyRequests = function (message, data) {

    return exports.create(429, message, data);
};


// 5xx Server Errors

exports.internal = function (message, data, statusCode) {

    var error = (data instanceof Error ? exports.wrap(data, statusCode, message) : exports.create(statusCode || 500, message));

    if (data instanceof Error === false) {
        error.data = data;
    }

    return error;
};


exports.notImplemented = function (message, data) {

    return exports.internal(message, data, 501);
};


exports.badGateway = function (message, data) {

    return exports.internal(message, data, 502);
};


exports.serverTimeout = function (message, data) {

    return exports.internal(message, data, 503);
};


exports.gatewayTimeout = function (message, data) {

    return exports.internal(message, data, 504);
};


exports.badImplementation = function (message, data) {

    var err = exports.internal(message, data, 500);
    err.isDeveloperError = true;
    return err;
};

},{"hoek":70,"http":undefined}],68:[function(require,module,exports){
module.exports = require('./lib');
},{"./lib":69}],69:[function(require,module,exports){
// Load modules

var Crypto = require('crypto');
var Boom = require('boom');


// Declare internals

var internals = {};


// Generate a cryptographically strong pseudo-random data

exports.randomString = function (size) {

    var buffer = exports.randomBits((size + 1) * 6);
    if (buffer instanceof Error) {
        return buffer;
    }

    var string = buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/\=/g, '');
    return string.slice(0, size);
};


exports.randomBits = function (bits) {

    if (!bits ||
        bits < 0) {

        return Boom.internal('Invalid random bits count');
    }

    var bytes = Math.ceil(bits / 8);
    try {
        return Crypto.randomBytes(bytes);
    }
    catch (err) {
        return Boom.internal('Failed generating random bits: ' + err.message);
    }
};


// Compare two strings using fixed time algorithm (to prevent time-based analysis of MAC digest match)

exports.fixedTimeComparison = function (a, b) {

    if (typeof a !== 'string' ||
        typeof b !== 'string') {

        return false;
    }

    var mismatch = (a.length === b.length ? 0 : 1);
    if (mismatch) {
        b = a;
    }

    for (var i = 0, il = a.length; i < il; ++i) {
        var ac = a.charCodeAt(i);
        var bc = b.charCodeAt(i);
        mismatch |= (ac ^ bc);
    }

    return (mismatch === 0);
};



},{"boom":67,"crypto":undefined}],70:[function(require,module,exports){
module.exports = require('./lib');

},{"./lib":72}],71:[function(require,module,exports){
// Declare internals

var internals = {};


exports.escapeJavaScript = function (input) {

    if (!input) {
        return '';
    }

    var escaped = '';

    for (var i = 0, il = input.length; i < il; ++i) {

        var charCode = input.charCodeAt(i);

        if (internals.isSafe(charCode)) {
            escaped += input[i];
        }
        else {
            escaped += internals.escapeJavaScriptChar(charCode);
        }
    }

    return escaped;
};


exports.escapeHtml = function (input) {

    if (!input) {
        return '';
    }

    var escaped = '';

    for (var i = 0, il = input.length; i < il; ++i) {

        var charCode = input.charCodeAt(i);

        if (internals.isSafe(charCode)) {
            escaped += input[i];
        }
        else {
            escaped += internals.escapeHtmlChar(charCode);
        }
    }

    return escaped;
};


internals.escapeJavaScriptChar = function (charCode) {

    if (charCode >= 256) {
        return '\\u' + internals.padLeft('' + charCode, 4);
    }

    var hexValue = new Buffer(String.fromCharCode(charCode), 'ascii').toString('hex');
    return '\\x' + internals.padLeft(hexValue, 2);
};


internals.escapeHtmlChar = function (charCode) {

    var namedEscape = internals.namedHtml[charCode];
    if (typeof namedEscape !== 'undefined') {
        return namedEscape;
    }

    if (charCode >= 256) {
        return '&#' + charCode + ';';
    }

    var hexValue = new Buffer(String.fromCharCode(charCode), 'ascii').toString('hex');
    return '&#x' + internals.padLeft(hexValue, 2) + ';';
};


internals.padLeft = function (str, len) {

    while (str.length < len) {
        str = '0' + str;
    }

    return str;
};


internals.isSafe = function (charCode) {

    return (typeof internals.safeCharCodes[charCode] !== 'undefined');
};


internals.namedHtml = {
    '38': '&amp;',
    '60': '&lt;',
    '62': '&gt;',
    '34': '&quot;',
    '160': '&nbsp;',
    '162': '&cent;',
    '163': '&pound;',
    '164': '&curren;',
    '169': '&copy;',
    '174': '&reg;'
};


internals.safeCharCodes = (function () {

    var safe = {};

    for (var i = 32; i < 123; ++i) {

        if ((i >= 97) ||                    // a-z
            (i >= 65 && i <= 90) ||         // A-Z
            (i >= 48 && i <= 57) ||         // 0-9
            i === 32 ||                     // space
            i === 46 ||                     // .
            i === 44 ||                     // ,
            i === 45 ||                     // -
            i === 58 ||                     // :
            i === 95) {                     // _

            safe[i] = null;
        }
    }

    return safe;
}());

},{}],72:[function(require,module,exports){
// Load modules

var Crypto = require('crypto');
var Path = require('path');
var Util = require('util');
var Escape = require('./escape');


// Declare internals

var internals = {};


// Clone object or array

exports.clone = function (obj, seen) {

    if (typeof obj !== 'object' ||
        obj === null) {

        return obj;
    }

    seen = seen || { orig: [], copy: [] };

    var lookup = seen.orig.indexOf(obj);
    if (lookup !== -1) {
        return seen.copy[lookup];
    }

    var newObj;
    var cloneDeep = false;

    if (!Array.isArray(obj)) {
        if (Buffer.isBuffer(obj)) {
            newObj = new Buffer(obj);
        }
        else if (obj instanceof Date) {
            newObj = new Date(obj.getTime());
        }
        else if (obj instanceof RegExp) {
            newObj = new RegExp(obj);
        }
        else {
            var proto = Object.getPrototypeOf(obj);
            if (proto &&
                proto.isImmutable) {

                newObj = obj;
            }
            else {
                newObj = Object.create(proto);
                cloneDeep = true;
            }
        }
    }
    else {
        newObj = [];
        cloneDeep = true;
    }

    seen.orig.push(obj);
    seen.copy.push(newObj);

    if (cloneDeep) {
        var keys = Object.getOwnPropertyNames(obj);
        for (var i = 0, il = keys.length; i < il; ++i) {
            var key = keys[i];
            var descriptor = Object.getOwnPropertyDescriptor(obj, key);
            if (descriptor.get ||
                descriptor.set) {

                Object.defineProperty(newObj, key, descriptor);
            }
            else {
                newObj[key] = exports.clone(obj[key], seen);
            }
        }
    }

    return newObj;
};


// Merge all the properties of source into target, source wins in conflict, and by default null and undefined from source are applied
/*eslint-disable */
exports.merge = function (target, source, isNullOverride /* = true */, isMergeArrays /* = true */) {
/*eslint-enable */
    exports.assert(target && typeof target === 'object', 'Invalid target value: must be an object');
    exports.assert(source === null || source === undefined || typeof source === 'object', 'Invalid source value: must be null, undefined, or an object');

    if (!source) {
        return target;
    }

    if (Array.isArray(source)) {
        exports.assert(Array.isArray(target), 'Cannot merge array onto an object');
        if (isMergeArrays === false) {                                                  // isMergeArrays defaults to true
            target.length = 0;                                                          // Must not change target assignment
        }

        for (var i = 0, il = source.length; i < il; ++i) {
            target.push(exports.clone(source[i]));
        }

        return target;
    }

    var keys = Object.keys(source);
    for (var k = 0, kl = keys.length; k < kl; ++k) {
        var key = keys[k];
        var value = source[key];
        if (value &&
            typeof value === 'object') {

            if (!target[key] ||
                typeof target[key] !== 'object' ||
                (Array.isArray(target[key]) ^ Array.isArray(value)) ||
                value instanceof Date ||
                Buffer.isBuffer(value) ||
                value instanceof RegExp) {

                target[key] = exports.clone(value);
            }
            else {
                exports.merge(target[key], value, isNullOverride, isMergeArrays);
            }
        }
        else {
            if (value !== null &&
                value !== undefined) {                              // Explicit to preserve empty strings

                target[key] = value;
            }
            else if (isNullOverride !== false) {                    // Defaults to true
                target[key] = value;
            }
        }
    }

    return target;
};


// Apply options to a copy of the defaults

exports.applyToDefaults = function (defaults, options, isNullOverride) {

    exports.assert(defaults && typeof defaults === 'object', 'Invalid defaults value: must be an object');
    exports.assert(!options || options === true || typeof options === 'object', 'Invalid options value: must be true, falsy or an object');

    if (!options) {                                                 // If no options, return null
        return null;
    }

    var copy = exports.clone(defaults);

    if (options === true) {                                         // If options is set to true, use defaults
        return copy;
    }

    return exports.merge(copy, options, isNullOverride === true, false);
};


// Clone an object except for the listed keys which are shallow copied

exports.cloneWithShallow = function (source, keys) {

    if (!source ||
        typeof source !== 'object') {

        return source;
    }

    var storage = internals.store(source, keys);    // Move shallow copy items to storage
    var copy = exports.clone(source);               // Deep copy the rest
    internals.restore(copy, source, storage);       // Shallow copy the stored items and restore
    return copy;
};


internals.store = function (source, keys) {

    var storage = {};
    for (var i = 0, il = keys.length; i < il; ++i) {
        var key = keys[i];
        var value = exports.reach(source, key);
        if (value !== undefined) {
            storage[key] = value;
            internals.reachSet(source, key, undefined);
        }
    }

    return storage;
};


internals.restore = function (copy, source, storage) {

    var keys = Object.keys(storage);
    for (var i = 0, il = keys.length; i < il; ++i) {
        var key = keys[i];
        internals.reachSet(copy, key, storage[key]);
        internals.reachSet(source, key, storage[key]);
    }
};


internals.reachSet = function (obj, key, value) {

    var path = key.split('.');
    var ref = obj;
    for (var i = 0, il = path.length; i < il; ++i) {
        var segment = path[i];
        if (i + 1 === il) {
            ref[segment] = value;
        }

        ref = ref[segment];
    }
};


// Apply options to defaults except for the listed keys which are shallow copied from option without merging

exports.applyToDefaultsWithShallow = function (defaults, options, keys) {

    exports.assert(defaults && typeof defaults === 'object', 'Invalid defaults value: must be an object');
    exports.assert(!options || options === true || typeof options === 'object', 'Invalid options value: must be true, falsy or an object');
    exports.assert(keys && Array.isArray(keys), 'Invalid keys');

    if (!options) {                                                 // If no options, return null
        return null;
    }

    var copy = exports.cloneWithShallow(defaults, keys);

    if (options === true) {                                         // If options is set to true, use defaults
        return copy;
    }

    var storage = internals.store(options, keys);   // Move shallow copy items to storage
    exports.merge(copy, options, false, false);     // Deep copy the rest
    internals.restore(copy, options, storage);      // Shallow copy the stored items and restore
    return copy;
};


// Deep object or array comparison

exports.deepEqual = function (obj, ref, options, seen) {

    options = options || { prototype: true };

    var type = typeof obj;

    if (type !== typeof ref) {
        return false;
    }

    if (type !== 'object' ||
        obj === null ||
        ref === null) {

        if (obj === ref) {                                                      // Copied from Deep-eql, copyright(c) 2013 Jake Luer, jake@alogicalparadox.com, MIT Licensed, https://github.com/chaijs/deep-eql
            return obj !== 0 || 1 / obj === 1 / ref;        // -0 / +0
        }

        return obj !== obj && ref !== ref;                  // NaN
    }

    seen = seen || [];
    if (seen.indexOf(obj) !== -1) {
        return true;                            // If previous comparison failed, it would have stopped execution
    }

    seen.push(obj);

    if (Array.isArray(obj)) {
        if (!Array.isArray(ref)) {
            return false;
        }

        if (!options.part && obj.length !== ref.length) {
            return false;
        }

        for (var i = 0, il = obj.length; i < il; ++i) {
            if (options.part) {
                var found = false;
                for (var r = 0, rl = ref.length; r < rl; ++r) {
                    if (exports.deepEqual(obj[i], ref[r], options, seen)) {
                        found = true;
                        break;
                    }
                }

                return found;
            }

            if (!exports.deepEqual(obj[i], ref[i], options, seen)) {
                return false;
            }
        }

        return true;
    }

    if (Buffer.isBuffer(obj)) {
        if (!Buffer.isBuffer(ref)) {
            return false;
        }

        if (obj.length !== ref.length) {
            return false;
        }

        for (var j = 0, jl = obj.length; j < jl; ++j) {
            if (obj[j] !== ref[j]) {
                return false;
            }
        }

        return true;
    }

    if (obj instanceof Date) {
        return (ref instanceof Date && obj.getTime() === ref.getTime());
    }

    if (obj instanceof RegExp) {
        return (ref instanceof RegExp && obj.toString() === ref.toString());
    }

    if (options.prototype) {
        if (Object.getPrototypeOf(obj) !== Object.getPrototypeOf(ref)) {
            return false;
        }
    }

    var keys = Object.getOwnPropertyNames(obj);

    if (!options.part && keys.length !== Object.getOwnPropertyNames(ref).length) {
        return false;
    }

    for (var k = 0, kl = keys.length; k < kl; ++k) {
        var key = keys[k];
        var descriptor = Object.getOwnPropertyDescriptor(obj, key);
        if (descriptor.get) {
            if (!exports.deepEqual(descriptor, Object.getOwnPropertyDescriptor(ref, key), options, seen)) {
                return false;
            }
        }
        else if (!exports.deepEqual(obj[key], ref[key], options, seen)) {
            return false;
        }
    }

    return true;
};


// Remove duplicate items from array

exports.unique = function (array, key) {

    var index = {};
    var result = [];

    for (var i = 0, il = array.length; i < il; ++i) {
        var id = (key ? array[i][key] : array[i]);
        if (index[id] !== true) {

            result.push(array[i]);
            index[id] = true;
        }
    }

    return result;
};


// Convert array into object

exports.mapToObject = function (array, key) {

    if (!array) {
        return null;
    }

    var obj = {};
    for (var i = 0, il = array.length; i < il; ++i) {
        if (key) {
            if (array[i][key]) {
                obj[array[i][key]] = true;
            }
        }
        else {
            obj[array[i]] = true;
        }
    }

    return obj;
};


// Find the common unique items in two arrays

exports.intersect = function (array1, array2, justFirst) {

    if (!array1 || !array2) {
        return [];
    }

    var common = [];
    var hash = (Array.isArray(array1) ? exports.mapToObject(array1) : array1);
    var found = {};
    for (var i = 0, il = array2.length; i < il; ++i) {
        if (hash[array2[i]] && !found[array2[i]]) {
            if (justFirst) {
                return array2[i];
            }

            common.push(array2[i]);
            found[array2[i]] = true;
        }
    }

    return (justFirst ? null : common);
};


// Test if the reference contains the values

exports.contain = function (ref, values, options) {

    /*
        string -> string(s)
        array -> item(s)
        object -> key(s)
        object -> object (key:value)
    */

    var valuePairs = null;
    if (typeof ref === 'object' &&
        typeof values === 'object' &&
        !Array.isArray(ref) &&
        !Array.isArray(values)) {

        valuePairs = values;
        values = Object.keys(values);
    }
    else {
        values = [].concat(values);
    }

    options = options || {};            // deep, once, only, part

    exports.assert(arguments.length >= 2, 'Insufficient arguments');
    exports.assert(typeof ref === 'string' || typeof ref === 'object', 'Reference must be string or an object');
    exports.assert(values.length, 'Values array cannot be empty');

    var compare, compareFlags;
    if (options.deep) {
        compare = exports.deepEqual;

        var hasOnly = options.hasOwnProperty('only'), hasPart = options.hasOwnProperty('part');

        compareFlags = {
            prototype: hasOnly ? options.only : hasPart ? !options.part : false,
            part: hasOnly ? !options.only : hasPart ? options.part : true
        };
    }
    else {
        compare = function (a, b) {

            return a === b;
        };
    }

    var misses = false;
    var matches = new Array(values.length);
    for (var i = 0, il = matches.length; i < il; ++i) {
        matches[i] = 0;
    }

    if (typeof ref === 'string') {
        var pattern = '(';
        for (i = 0, il = values.length; i < il; ++i) {
            var value = values[i];
            exports.assert(typeof value === 'string', 'Cannot compare string reference to non-string value');
            pattern += (i ? '|' : '') + exports.escapeRegex(value);
        }

        var regex = new RegExp(pattern + ')', 'g');
        var leftovers = ref.replace(regex, function ($0, $1) {

            var index = values.indexOf($1);
            ++matches[index];
            return '';          // Remove from string
        });

        misses = !!leftovers;
    }
    else if (Array.isArray(ref)) {
        for (i = 0, il = ref.length; i < il; ++i) {
            for (var j = 0, jl = values.length, matched = false; j < jl && matched === false; ++j) {
                matched = compare(values[j], ref[i], compareFlags) && j;
            }

            if (matched !== false) {
                ++matches[matched];
            }
            else {
                misses = true;
            }
        }
    }
    else {
        var keys = Object.keys(ref);
        for (i = 0, il = keys.length; i < il; ++i) {
            var key = keys[i];
            var pos = values.indexOf(key);
            if (pos !== -1) {
                if (valuePairs &&
                    !compare(valuePairs[key], ref[key], compareFlags)) {

                    return false;
                }

                ++matches[pos];
            }
            else {
                misses = true;
            }
        }
    }

    var result = false;
    for (i = 0, il = matches.length; i < il; ++i) {
        result = result || !!matches[i];
        if ((options.once && matches[i] > 1) ||
            (!options.part && !matches[i])) {

            return false;
        }
    }

    if (options.only &&
        misses) {

        return false;
    }

    return result;
};


// Flatten array

exports.flatten = function (array, target) {

    var result = target || [];

    for (var i = 0, il = array.length; i < il; ++i) {
        if (Array.isArray(array[i])) {
            exports.flatten(array[i], result);
        }
        else {
            result.push(array[i]);
        }
    }

    return result;
};


// Convert an object key chain string ('a.b.c') to reference (object[a][b][c])

exports.reach = function (obj, chain, options) {

    options = options || {};
    if (typeof options === 'string') {
        options = { separator: options };
    }

    var path = chain.split(options.separator || '.');
    var ref = obj;
    for (var i = 0, il = path.length; i < il; ++i) {
        var key = path[i];
        if (key[0] === '-' && Array.isArray(ref)) {
            key = key.slice(1, key.length);
            key = ref.length - key;
        }

        if (!ref ||
            !ref.hasOwnProperty(key) ||
            (typeof ref !== 'object' && options.functions === false)) {         // Only object and function can have properties

            exports.assert(!options.strict || i + 1 === il, 'Missing segment', key, 'in reach path ', chain);
            exports.assert(typeof ref === 'object' || options.functions === true || typeof ref !== 'function', 'Invalid segment', key, 'in reach path ', chain);
            ref = options.default;
            break;
        }

        ref = ref[key];
    }

    return ref;
};


exports.reachTemplate = function (obj, template, options) {

    return template.replace(/{([^}]+)}/g, function ($0, chain) {

        var value = exports.reach(obj, chain, options);
        return (value === undefined || value === null ? '' : value);
    });
};


exports.formatStack = function (stack) {

    var trace = [];
    for (var i = 0, il = stack.length; i < il; ++i) {
        var item = stack[i];
        trace.push([item.getFileName(), item.getLineNumber(), item.getColumnNumber(), item.getFunctionName(), item.isConstructor()]);
    }

    return trace;
};


exports.formatTrace = function (trace) {

    var display = [];

    for (var i = 0, il = trace.length; i < il; ++i) {
        var row = trace[i];
        display.push((row[4] ? 'new ' : '') + row[3] + ' (' + row[0] + ':' + row[1] + ':' + row[2] + ')');
    }

    return display;
};


exports.callStack = function (slice) {

    // http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi

    var v8 = Error.prepareStackTrace;
    Error.prepareStackTrace = function (err, stack) {

        return stack;
    };

    var capture = {};
    Error.captureStackTrace(capture, arguments.callee);     /*eslint no-caller:0 */
    var stack = capture.stack;

    Error.prepareStackTrace = v8;

    var trace = exports.formatStack(stack);

    if (slice) {
        return trace.slice(slice);
    }

    return trace;
};


exports.displayStack = function (slice) {

    var trace = exports.callStack(slice === undefined ? 1 : slice + 1);

    return exports.formatTrace(trace);
};


exports.abortThrow = false;


exports.abort = function (message, hideStack) {

    if (process.env.NODE_ENV === 'test' || exports.abortThrow === true) {
        throw new Error(message || 'Unknown error');
    }

    var stack = '';
    if (!hideStack) {
        stack = exports.displayStack(1).join('\n\t');
    }
    console.log('ABORT: ' + message + '\n\t' + stack);
    process.exit(1);
};


exports.assert = function (condition /*, msg1, msg2, msg3 */) {

    if (condition) {
        return;
    }

    if (arguments.length === 2 && arguments[1] instanceof Error) {
        throw arguments[1];
    }

    var msgs = [];
    for (var i = 1, il = arguments.length; i < il; ++i) {
        if (arguments[i] !== '') {
            msgs.push(arguments[i]);            // Avoids Array.slice arguments leak, allowing for V8 optimizations
        }
    }

    msgs = msgs.map(function (msg) {

        return typeof msg === 'string' ? msg : msg instanceof Error ? msg.message : exports.stringify(msg);
    });
    throw new Error(msgs.join(' ') || 'Unknown error');
};


exports.Timer = function () {

    this.ts = 0;
    this.reset();
};


exports.Timer.prototype.reset = function () {

    this.ts = Date.now();
};


exports.Timer.prototype.elapsed = function () {

    return Date.now() - this.ts;
};


exports.Bench = function () {

    this.ts = 0;
    this.reset();
};


exports.Bench.prototype.reset = function () {

    this.ts = exports.Bench.now();
};


exports.Bench.prototype.elapsed = function () {

    return exports.Bench.now() - this.ts;
};


exports.Bench.now = function () {

    var ts = process.hrtime();
    return (ts[0] * 1e3) + (ts[1] / 1e6);
};


// Escape string for Regex construction

exports.escapeRegex = function (string) {

    // Escape ^$.*+-?=!:|\/()[]{},
    return string.replace(/[\^\$\.\*\+\-\?\=\!\:\|\\\/\(\)\[\]\{\}\,]/g, '\\$&');
};


// Base64url (RFC 4648) encode

exports.base64urlEncode = function (value, encoding) {

    var buf = (Buffer.isBuffer(value) ? value : new Buffer(value, encoding || 'binary'));
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/\=/g, '');
};


// Base64url (RFC 4648) decode

exports.base64urlDecode = function (value, encoding) {

    if (value &&
        !/^[\w\-]*$/.test(value)) {

        return new Error('Invalid character');
    }

    try {
        var buf = new Buffer(value, 'base64');
        return (encoding === 'buffer' ? buf : buf.toString(encoding || 'binary'));
    }
    catch (err) {
        return err;
    }
};


// Escape attribute value for use in HTTP header

exports.escapeHeaderAttribute = function (attribute) {

    // Allowed value characters: !#$%&'()*+,-./:;<=>?@[]^_`{|}~ and space, a-z, A-Z, 0-9, \, "

    exports.assert(/^[ \w\!#\$%&'\(\)\*\+,\-\.\/\:;<\=>\?@\[\]\^`\{\|\}~\"\\]*$/.test(attribute), 'Bad attribute value (' + attribute + ')');

    return attribute.replace(/\\/g, '\\\\').replace(/\"/g, '\\"');                             // Escape quotes and slash
};


exports.escapeHtml = function (string) {

    return Escape.escapeHtml(string);
};


exports.escapeJavaScript = function (string) {

    return Escape.escapeJavaScript(string);
};


exports.nextTick = function (callback) {

    return function () {

        var args = arguments;
        process.nextTick(function () {

            callback.apply(null, args);
        });
    };
};


exports.once = function (method) {

    if (method._hoekOnce) {
        return method;
    }

    var once = false;
    var wrapped = function () {

        if (!once) {
            once = true;
            method.apply(null, arguments);
        }
    };

    wrapped._hoekOnce = true;

    return wrapped;
};


exports.isAbsolutePath = function (path, platform) {

    if (!path) {
        return false;
    }

    if (Path.isAbsolute) {                      // node >= 0.11
        return Path.isAbsolute(path);
    }

    platform = platform || process.platform;

    // Unix

    if (platform !== 'win32') {
        return path[0] === '/';
    }

    // Windows

    return !!/^(?:[a-zA-Z]:[\\\/])|(?:[\\\/]{2}[^\\\/]+[\\\/]+[^\\\/])/.test(path);        // C:\ or \\something\something
};


exports.isInteger = function (value) {

    return (typeof value === 'number' &&
            parseFloat(value) === parseInt(value, 10) &&
            !isNaN(value));
};


exports.ignore = function () { };


exports.inherits = Util.inherits;


exports.format = Util.format;


exports.transform = function (source, transform, options) {

    exports.assert(source === null || source === undefined || typeof source === 'object', 'Invalid source object: must be null, undefined, or an object');

    var result = {};
    var keys = Object.keys(transform);

    for (var k = 0, kl = keys.length; k < kl; ++k) {
        var key = keys[k];
        var path = key.split('.');
        var sourcePath = transform[key];

        exports.assert(typeof sourcePath === 'string', 'All mappings must be "." delineated strings');

        var segment;
        var res = result;

        while (path.length > 1) {
            segment = path.shift();
            if (!res[segment]) {
                res[segment] = {};
            }
            res = res[segment];
        }
        segment = path.shift();
        res[segment] = exports.reach(source, sourcePath, options);
    }

    return result;
};


exports.uniqueFilename = function (path, extension) {

    if (extension) {
        extension = extension[0] !== '.' ? '.' + extension : extension;
    }
    else {
        extension = '';
    }

    path = Path.resolve(path);
    var name = [Date.now(), process.pid, Crypto.randomBytes(8).toString('hex')].join('-') + extension;
    return Path.join(path, name);
};


exports.stringify = function () {

    try {
        return JSON.stringify.apply(null, arguments);
    }
    catch (err) {
        return '[Cannot display object: ' + err.message + ']';
    }
};


exports.shallow = function (source) {

    var target = {};
    var keys = Object.keys(source);
    for (var i = 0, il = keys.length; i < il; ++i) {
        var key = keys[i];
        target[key] = source[key];
    }

    return target;
};

},{"./escape":71,"crypto":undefined,"path":undefined,"util":undefined}],73:[function(require,module,exports){
arguments[4][68][0].apply(exports,arguments)
},{"./lib":74,"dup":68}],74:[function(require,module,exports){
// Load modules

var Dgram = require('dgram');
var Dns = require('dns');
var Hoek = require('hoek');


// Declare internals

var internals = {};


exports.time = function (options, callback) {

    if (arguments.length !== 2) {
        callback = arguments[0];
        options = {};
    }

    var settings = Hoek.clone(options);
    settings.host = settings.host || 'pool.ntp.org';
    settings.port = settings.port || 123;
    settings.resolveReference = settings.resolveReference || false;

    // Declare variables used by callback

    var timeoutId = 0;
    var sent = 0;

    // Ensure callback is only called once

    var finish = function (err, result) {

        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = 0;
        }

        socket.removeAllListeners();
        socket.once('error', internals.ignore);
        socket.close();
        return callback(err, result);
    };

    finish = Hoek.once(finish);

    // Create UDP socket

    var socket = Dgram.createSocket('udp4');

    socket.once('error', function (err) {

        return finish(err);
    });

    // Listen to incoming messages

    socket.on('message', function (buffer, rinfo) {

        var received = Date.now();

        var message = new internals.NtpMessage(buffer);
        if (!message.isValid) {
            return finish(new Error('Invalid server response'), message);
        }

        if (message.originateTimestamp !== sent) {
            return finish(new Error('Wrong originate timestamp'), message);
        }

        // Timestamp Name          ID   When Generated
        // ------------------------------------------------------------
        // Originate Timestamp     T1   time request sent by client
        // Receive Timestamp       T2   time request received by server
        // Transmit Timestamp      T3   time reply sent by server
        // Destination Timestamp   T4   time reply received by client
        //
        // The roundtrip delay d and system clock offset t are defined as:
        //
        // d = (T4 - T1) - (T3 - T2)     t = ((T2 - T1) + (T3 - T4)) / 2

        var T1 = message.originateTimestamp;
        var T2 = message.receiveTimestamp;
        var T3 = message.transmitTimestamp;
        var T4 = received;

        message.d = (T4 - T1) - (T3 - T2);
        message.t = ((T2 - T1) + (T3 - T4)) / 2;
        message.receivedLocally = received;

        if (!settings.resolveReference ||
            message.stratum !== 'secondary') {

            return finish(null, message);
        }

        // Resolve reference IP address

        Dns.reverse(message.referenceId, function (err, domains) {

            if (/* $lab:coverage:off$ */ !err /* $lab:coverage:on$ */) {
                message.referenceHost = domains[0];
            }

            return finish(null, message);
        });
    });

    // Set timeout

    if (settings.timeout) {
        timeoutId = setTimeout(function () {

            timeoutId = 0;
            return finish(new Error('Timeout'));
        }, settings.timeout);
    }

    // Construct NTP message

    var message = new Buffer(48);
    for (var i = 0; i < 48; i++) {                      // Zero message
        message[i] = 0;
    }

    message[0] = (0 << 6) + (4 << 3) + (3 << 0)         // Set version number to 4 and Mode to 3 (client)
    sent = Date.now();
    internals.fromMsecs(sent, message, 40);               // Set transmit timestamp (returns as originate)

    // Send NTP request

    socket.send(message, 0, message.length, settings.port, settings.host, function (err, bytes) {

        if (err ||
            bytes !== 48) {

            return finish(err || new Error('Could not send entire message'));
        }
    });
};


internals.NtpMessage = function (buffer) {

    this.isValid = false;

    // Validate

    if (buffer.length !== 48) {
        return;
    }

    // Leap indicator

    var li = (buffer[0] >> 6);
    switch (li) {
        case 0: this.leapIndicator = 'no-warning'; break;
        case 1: this.leapIndicator = 'last-minute-61'; break;
        case 2: this.leapIndicator = 'last-minute-59'; break;
        case 3: this.leapIndicator = 'alarm'; break;
    }

    // Version

    var vn = ((buffer[0] & 0x38) >> 3);
    this.version = vn;

    // Mode

    var mode = (buffer[0] & 0x7);
    switch (mode) {
        case 1: this.mode = 'symmetric-active'; break;
        case 2: this.mode = 'symmetric-passive'; break;
        case 3: this.mode = 'client'; break;
        case 4: this.mode = 'server'; break;
        case 5: this.mode = 'broadcast'; break;
        case 0:
        case 6:
        case 7: this.mode = 'reserved'; break;
    }

    // Stratum

    var stratum = buffer[1];
    if (stratum === 0) {
        this.stratum = 'death';
    }
    else if (stratum === 1) {
        this.stratum = 'primary';
    }
    else if (stratum <= 15) {
        this.stratum = 'secondary';
    }
    else {
        this.stratum = 'reserved';
    }

    // Poll interval (msec)

    this.pollInterval = Math.round(Math.pow(2, buffer[2])) * 1000;

    // Precision (msecs)

    this.precision = Math.pow(2, buffer[3]) * 1000;

    // Root delay (msecs)

    var rootDelay = 256 * (256 * (256 * buffer[4] + buffer[5]) + buffer[6]) + buffer[7];
    this.rootDelay = 1000 * (rootDelay / 0x10000);

    // Root dispersion (msecs)

    this.rootDispersion = ((buffer[8] << 8) + buffer[9] + ((buffer[10] << 8) + buffer[11]) / Math.pow(2, 16)) * 1000;

    // Reference identifier

    this.referenceId = '';
    switch (this.stratum) {
        case 'death':
        case 'primary':
            this.referenceId = String.fromCharCode(buffer[12]) + String.fromCharCode(buffer[13]) + String.fromCharCode(buffer[14]) + String.fromCharCode(buffer[15]);
            break;
        case 'secondary':
            this.referenceId = '' + buffer[12] + '.' + buffer[13] + '.' + buffer[14] + '.' + buffer[15];
            break;
    }

    // Reference timestamp

    this.referenceTimestamp = internals.toMsecs(buffer, 16);

    // Originate timestamp

    this.originateTimestamp = internals.toMsecs(buffer, 24);

    // Receive timestamp

    this.receiveTimestamp = internals.toMsecs(buffer, 32);

    // Transmit timestamp

    this.transmitTimestamp = internals.toMsecs(buffer, 40);

    // Validate

    if (this.version === 4 &&
        this.stratum !== 'reserved' &&
        this.mode === 'server' &&
        this.originateTimestamp &&
        this.receiveTimestamp &&
        this.transmitTimestamp) {

        this.isValid = true;
    }

    return this;
};


internals.toMsecs = function (buffer, offset) {

    var seconds = 0;
    var fraction = 0;

    for (var i = 0; i < 4; ++i) {
        seconds = (seconds * 256) + buffer[offset + i];
    }

    for (i = 4; i < 8; ++i) {
        fraction = (fraction * 256) + buffer[offset + i];
    }

    return ((seconds - 2208988800 + (fraction / Math.pow(2, 32))) * 1000);
};


internals.fromMsecs = function (ts, buffer, offset) {

    var seconds = Math.floor(ts / 1000) + 2208988800;
    var fraction = Math.round((ts % 1000) / 1000 * Math.pow(2, 32));

    buffer[offset + 0] = (seconds & 0xFF000000) >> 24;
    buffer[offset + 1] = (seconds & 0x00FF0000) >> 16;
    buffer[offset + 2] = (seconds & 0x0000FF00) >> 8;
    buffer[offset + 3] = (seconds & 0x000000FF);

    buffer[offset + 4] = (fraction & 0xFF000000) >> 24;
    buffer[offset + 5] = (fraction & 0x00FF0000) >> 16;
    buffer[offset + 6] = (fraction & 0x0000FF00) >> 8;
    buffer[offset + 7] = (fraction & 0x000000FF);
};


// Offset singleton

internals.last = {
    offset: 0,
    expires: 0,
    host: '',
    port: 0
};


exports.offset = function (options, callback) {

    if (arguments.length !== 2) {
        callback = arguments[0];
        options = {};
    }

    var now = Date.now();
    var clockSyncRefresh = options.clockSyncRefresh || 24 * 60 * 60 * 1000;                    // Daily

    if (internals.last.offset &&
        internals.last.host === options.host &&
        internals.last.port === options.port &&
        now < internals.last.expires) {

        process.nextTick(function () {

            callback(null, internals.last.offset);
        });

        return;
    }

    exports.time(options, function (err, time) {

        if (err) {
            return callback(err, 0);
        }

        internals.last = {
            offset: Math.round(time.t),
            expires: now + clockSyncRefresh,
            host: options.host,
            port: options.port
        };

        return callback(null, internals.last.offset);
    });
};


// Now singleton

internals.now = {
    intervalId: 0
};


exports.start = function (options, callback) {

    if (arguments.length !== 2) {
        callback = arguments[0];
        options = {};
    }

    if (internals.now.intervalId) {
        process.nextTick(function () {

            callback();
        });

        return;
    }

    exports.offset(options, function (err, offset) {

        internals.now.intervalId = setInterval(function () {

            exports.offset(options, function () { });
        }, options.clockSyncRefresh || 24 * 60 * 60 * 1000);                                // Daily

        return callback();
    });
};


exports.stop = function () {

    if (!internals.now.intervalId) {
        return;
    }

    clearInterval(internals.now.intervalId);
    internals.now.intervalId = 0;
};


exports.isLive = function () {

    return !!internals.now.intervalId;
};


exports.now = function () {

    var now = Date.now();
    if (!exports.isLive() ||
        now >= internals.last.expires) {

        return now;
    }

    return now + internals.last.offset;
};


internals.ignore = function () {

};

},{"dgram":undefined,"dns":undefined,"hoek":70}],75:[function(require,module,exports){
module.exports={
  "name": "hawk",
  "description": "HTTP Hawk Authentication Scheme",
  "version": "3.1.0",
  "author": {
    "name": "Eran Hammer",
    "email": "eran@hammer.io",
    "url": "http://hueniverse.com"
  },
  "contributors": [],
  "repository": {
    "type": "git",
    "url": "git://github.com/hueniverse/hawk.git"
  },
  "main": "lib/index.js",
  "keywords": [
    "http",
    "authentication",
    "scheme",
    "hawk"
  ],
  "engines": {
    "node": ">=0.10.32"
  },
  "browser": "./lib/browser.js",
  "dependencies": {
    "hoek": "2.x.x",
    "boom": "^2.8.x",
    "cryptiles": "2.x.x",
    "sntp": "1.x.x"
  },
  "devDependencies": {
    "code": "1.x.x",
    "lab": "5.x.x"
  },
  "scripts": {
    "test": "lab -a code -t 100 -L",
    "test-cov-html": "lab -a code -r html -o coverage.html"
  },
  "license": "BSD-3-Clause",
  "gitHead": "fdb9d05e383d5237631eaddc4f51422e54fa8b52",
  "bugs": {
    "url": "https://github.com/hueniverse/hawk/issues"
  },
  "homepage": "https://github.com/hueniverse/hawk#readme",
  "_id": "hawk@3.1.0",
  "_shasum": "8a13ae19977ec607602f3f0b9fd676f18c384e44",
  "_from": "hawk@>=3.1.0 <3.2.0",
  "_npmVersion": "2.10.0",
  "_nodeVersion": "0.10.38",
  "_npmUser": {
    "name": "hueniverse",
    "email": "eran@hammer.io"
  },
  "dist": {
    "shasum": "8a13ae19977ec607602f3f0b9fd676f18c384e44",
    "tarball": "http://registry.npmjs.org/hawk/-/hawk-3.1.0.tgz"
  },
  "maintainers": [
    {
      "name": "hueniverse",
      "email": "eran@hueniverse.com"
    }
  ],
  "directories": {},
  "_resolved": "https://registry.npmjs.org/hawk/-/hawk-3.1.0.tgz",
  "readme": "ERROR: No README data found!"
}

},{}],76:[function(require,module,exports){
// Copyright 2015 Joyent, Inc.

var parser = require('./parser');
var signer = require('./signer');
var verify = require('./verify');
var util = require('./util');



///--- API

module.exports = {

  parse: parser.parseRequest,
  parseRequest: parser.parseRequest,

  sign: signer.signRequest,
  signRequest: signer.signRequest,

  sshKeyToPEM: util.sshKeyToPEM,
  sshKeyFingerprint: util.fingerprint,
  pemToRsaSSHKey: util.pemToRsaSSHKey,

  verify: verify.verifySignature,
  verifySignature: verify.verifySignature,
  verifyHMAC: verify.verifyHMAC
};

},{"./parser":77,"./signer":78,"./util":79,"./verify":80}],77:[function(require,module,exports){
// Copyright 2012 Joyent, Inc.  All rights reserved.

var assert = require('assert-plus');
var util = require('util');



///--- Globals

var Algorithms = {
  'rsa-sha1': true,
  'rsa-sha256': true,
  'rsa-sha512': true,
  'dsa-sha1': true,
  'hmac-sha1': true,
  'hmac-sha256': true,
  'hmac-sha512': true
};

var State = {
  New: 0,
  Params: 1
};

var ParamsState = {
  Name: 0,
  Quote: 1,
  Value: 2,
  Comma: 3
};



///--- Specific Errors

function HttpSignatureError(message, caller) {
  if (Error.captureStackTrace)
    Error.captureStackTrace(this, caller || HttpSignatureError);

  this.message = message;
  this.name = caller.name;
}
util.inherits(HttpSignatureError, Error);

function ExpiredRequestError(message) {
  HttpSignatureError.call(this, message, ExpiredRequestError);
}
util.inherits(ExpiredRequestError, HttpSignatureError);


function InvalidHeaderError(message) {
  HttpSignatureError.call(this, message, InvalidHeaderError);
}
util.inherits(InvalidHeaderError, HttpSignatureError);


function InvalidParamsError(message) {
  HttpSignatureError.call(this, message, InvalidParamsError);
}
util.inherits(InvalidParamsError, HttpSignatureError);


function MissingHeaderError(message) {
  HttpSignatureError.call(this, message, MissingHeaderError);
}
util.inherits(MissingHeaderError, HttpSignatureError);



///--- Exported API

module.exports = {

  /**
   * Parses the 'Authorization' header out of an http.ServerRequest object.
   *
   * Note that this API will fully validate the Authorization header, and throw
   * on any error.  It will not however check the signature, or the keyId format
   * as those are specific to your environment.  You can use the options object
   * to pass in extra constraints.
   *
   * As a response object you can expect this:
   *
   *     {
   *       "scheme": "Signature",
   *       "params": {
   *         "keyId": "foo",
   *         "algorithm": "rsa-sha256",
   *         "headers": [
   *           "date" or "x-date",
   *           "content-md5"
   *         ],
   *         "signature": "base64"
   *       },
   *       "signingString": "ready to be passed to crypto.verify()"
   *     }
   *
   * @param {Object} request an http.ServerRequest.
   * @param {Object} options an optional options object with:
   *                   - clockSkew: allowed clock skew in seconds (default 300).
   *                   - headers: required header names (def: date or x-date)
   *                   - algorithms: algorithms to support (default: all).
   * @return {Object} parsed out object (see above).
   * @throws {TypeError} on invalid input.
   * @throws {InvalidHeaderError} on an invalid Authorization header error.
   * @throws {InvalidParamsError} if the params in the scheme are invalid.
   * @throws {MissingHeaderError} if the params indicate a header not present,
   *                              either in the request headers from the params,
   *                              or not in the params from a required header
   *                              in options.
   * @throws {ExpiredRequestError} if the value of date or x-date exceeds skew.
   */
  parseRequest: function parseRequest(request, options) {
    assert.object(request, 'request');
    assert.object(request.headers, 'request.headers');
    if (options === undefined) {
      options = {};
    }
    if (options.headers === undefined) {
      options.headers = [request.headers['x-date'] ? 'x-date' : 'date'];
    }
    assert.object(options, 'options');
    assert.arrayOfString(options.headers, 'options.headers');
    assert.optionalNumber(options.clockSkew, 'options.clockSkew');

    if (!request.headers.authorization)
      throw new MissingHeaderError('no authorization header present in ' +
                                   'the request');

    options.clockSkew = options.clockSkew || 300;


    var i = 0;
    var state = State.New;
    var substate = ParamsState.Name;
    var tmpName = '';
    var tmpValue = '';

    var parsed = {
      scheme: '',
      params: {},
      signingString: '',

      get algorithm() {
        return this.params.algorithm.toUpperCase();
      },

      get keyId() {
        return this.params.keyId;
      }

    };

    var authz = request.headers.authorization;
    for (i = 0; i < authz.length; i++) {
      var c = authz.charAt(i);

      switch (Number(state)) {

      case State.New:
        if (c !== ' ') parsed.scheme += c;
        else state = State.Params;
        break;

      case State.Params:
        switch (Number(substate)) {

        case ParamsState.Name:
          var code = c.charCodeAt(0);
          // restricted name of A-Z / a-z
          if ((code >= 0x41 && code <= 0x5a) || // A-Z
              (code >= 0x61 && code <= 0x7a)) { // a-z
            tmpName += c;
          } else if (c === '=') {
            if (tmpName.length === 0)
              throw new InvalidHeaderError('bad param format');
            substate = ParamsState.Quote;
          } else {
            throw new InvalidHeaderError('bad param format');
          }
          break;

        case ParamsState.Quote:
          if (c === '"') {
            tmpValue = '';
            substate = ParamsState.Value;
          } else {
            throw new InvalidHeaderError('bad param format');
          }
          break;

        case ParamsState.Value:
          if (c === '"') {
            parsed.params[tmpName] = tmpValue;
            substate = ParamsState.Comma;
          } else {
            tmpValue += c;
          }
          break;

        case ParamsState.Comma:
          if (c === ',') {
            tmpName = '';
            substate = ParamsState.Name;
          } else {
            throw new InvalidHeaderError('bad param format');
          }
          break;

        default:
          throw new Error('Invalid substate');
        }
        break;

      default:
        throw new Error('Invalid substate');
      }

    }

    if (!parsed.params.headers || parsed.params.headers === '') {
      if (request.headers['x-date']) {
        parsed.params.headers = ['x-date'];
      } else {
        parsed.params.headers = ['date'];
      }
    } else {
      parsed.params.headers = parsed.params.headers.split(' ');
    }

    // Minimally validate the parsed object
    if (!parsed.scheme || parsed.scheme !== 'Signature')
      throw new InvalidHeaderError('scheme was not "Signature"');

    if (!parsed.params.keyId)
      throw new InvalidHeaderError('keyId was not specified');

    if (!parsed.params.algorithm)
      throw new InvalidHeaderError('algorithm was not specified');

    if (!parsed.params.signature)
      throw new InvalidHeaderError('signature was not specified');

    // Check the algorithm against the official list
    parsed.params.algorithm = parsed.params.algorithm.toLowerCase();
    if (!Algorithms[parsed.params.algorithm])
      throw new InvalidParamsError(parsed.params.algorithm +
                                   ' is not supported');

    // Build the signingString
    for (i = 0; i < parsed.params.headers.length; i++) {
      var h = parsed.params.headers[i].toLowerCase();
      parsed.params.headers[i] = h;

      if (h !== 'request-line') {
        var value = request.headers[h];
        if (!value)
          throw new MissingHeaderError(h + ' was not in the request');
        parsed.signingString += h + ': ' + value;
      } else {
        parsed.signingString +=
          request.method + ' ' + request.url + ' HTTP/' + request.httpVersion;
      }

      if ((i + 1) < parsed.params.headers.length)
        parsed.signingString += '\n';
    }

    // Check against the constraints
    var date;
    if (request.headers.date || request.headers['x-date']) {
        if (request.headers['x-date']) {
          date = new Date(request.headers['x-date']);
        } else {
          date = new Date(request.headers.date);
        }
      var now = new Date();
      var skew = Math.abs(now.getTime() - date.getTime());

      if (skew > options.clockSkew * 1000) {
        throw new ExpiredRequestError('clock skew of ' +
                                      (skew / 1000) +
                                      's was greater than ' +
                                      options.clockSkew + 's');
      }
    }

    options.headers.forEach(function (hdr) {
      // Remember that we already checked any headers in the params
      // were in the request, so if this passes we're good.
      if (parsed.params.headers.indexOf(hdr) < 0)
        throw new MissingHeaderError(hdr + ' was not a signed header');
    });

    if (options.algorithms) {
      if (options.algorithms.indexOf(parsed.params.algorithm) === -1)
        throw new InvalidParamsError(parsed.params.algorithm +
                                     ' is not a supported algorithm');
    }

    return parsed;
  }

};

},{"assert-plus":87,"util":undefined}],78:[function(require,module,exports){
// Copyright 2012 Joyent, Inc.  All rights reserved.

var assert = require('assert-plus');
var crypto = require('crypto');
var http = require('http');

var sprintf = require('util').format;



///--- Globals

var Algorithms = {
  'rsa-sha1': true,
  'rsa-sha256': true,
  'rsa-sha512': true,
  'dsa-sha1': true,
  'hmac-sha1': true,
  'hmac-sha256': true,
  'hmac-sha512': true
};

var Authorization =
  'Signature keyId="%s",algorithm="%s",headers="%s",signature="%s"';



///--- Specific Errors

function MissingHeaderError(message) {
    this.name = 'MissingHeaderError';
    this.message = message;
    this.stack = (new Error()).stack;
}
MissingHeaderError.prototype = new Error();


function InvalidAlgorithmError(message) {
    this.name = 'InvalidAlgorithmError';
    this.message = message;
    this.stack = (new Error()).stack;
}
InvalidAlgorithmError.prototype = new Error();



///--- Internal Functions

function _pad(val) {
  if (parseInt(val, 10) < 10) {
    val = '0' + val;
  }
  return val;
}


function _rfc1123() {
  var date = new Date();

  var months = ['Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec'];
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getUTCDay()] + ', ' +
    _pad(date.getUTCDate()) + ' ' +
    months[date.getUTCMonth()] + ' ' +
    date.getUTCFullYear() + ' ' +
    _pad(date.getUTCHours()) + ':' +
    _pad(date.getUTCMinutes()) + ':' +
    _pad(date.getUTCSeconds()) +
    ' GMT';
}



///--- Exported API

module.exports = {

  /**
   * Adds an 'Authorization' header to an http.ClientRequest object.
   *
   * Note that this API will add a Date header if it's not already set. Any
   * other headers in the options.headers array MUST be present, or this
   * will throw.
   *
   * You shouldn't need to check the return type; it's just there if you want
   * to be pedantic.
   *
   * @param {Object} request an instance of http.ClientRequest.
   * @param {Object} options signing parameters object:
   *                   - {String} keyId required.
   *                   - {String} key required (either a PEM or HMAC key).
   *                   - {Array} headers optional; defaults to ['date'].
   *                   - {String} algorithm optional; defaults to 'rsa-sha256'.
   *                   - {String} httpVersion optional; defaults to '1.1'.
   * @return {Boolean} true if Authorization (and optionally Date) were added.
   * @throws {TypeError} on bad parameter types (input).
   * @throws {InvalidAlgorithmError} if algorithm was bad.
   * @throws {MissingHeaderError} if a header to be signed was specified but
   *                              was not present.
   */
  signRequest: function signRequest(request, options) {
    assert.object(request, 'request');
    assert.object(options, 'options');
    assert.optionalString(options.algorithm, 'options.algorithm');
    assert.string(options.keyId, 'options.keyId');
    assert.optionalArrayOfString(options.headers, 'options.headers');
    assert.optionalString(options.httpVersion, 'options.httpVersion');

    if (!request.getHeader('Date'))
      request.setHeader('Date', _rfc1123());
    if (!options.headers)
      options.headers = ['date'];
    if (!options.algorithm)
      options.algorithm = 'rsa-sha256';
    if (!options.httpVersion)
      options.httpVersion = '1.1';

    options.algorithm = options.algorithm.toLowerCase();

    if (!Algorithms[options.algorithm])
      throw new InvalidAlgorithmError(options.algorithm + ' is not supported');

    var i;
    var stringToSign = '';
    for (i = 0; i < options.headers.length; i++) {
      if (typeof (options.headers[i]) !== 'string')
        throw new TypeError('options.headers must be an array of Strings');

      var h = options.headers[i].toLowerCase();

      if (h !== 'request-line') {
        var value = request.getHeader(h);
        if (!value) {
          throw new MissingHeaderError(h + ' was not in the request');
        }
        stringToSign += h + ': ' + value;
      } else {
        stringToSign +=
          request.method + ' ' + request.path + ' HTTP/' + options.httpVersion;
      }

      if ((i + 1) < options.headers.length)
        stringToSign += '\n';
    }

    var alg = options.algorithm.match(/(hmac|rsa)-(\w+)/);
    var signature;
    if (alg[1] === 'hmac') {
      var hmac = crypto.createHmac(alg[2].toUpperCase(), options.key);
      hmac.update(stringToSign);
      signature = hmac.digest('base64');
    } else {
      var signer = crypto.createSign(options.algorithm.toUpperCase());
      signer.update(stringToSign);
      signature = signer.sign(options.key, 'base64');
    }

    request.setHeader('Authorization', sprintf(Authorization,
                                               options.keyId,
                                               options.algorithm,
                                               options.headers.join(' '),
                                               signature));

    return true;
  }

};

},{"assert-plus":87,"crypto":undefined,"http":undefined,"util":undefined}],79:[function(require,module,exports){
// Copyright 2012 Joyent, Inc.  All rights reserved.

var assert = require('assert-plus');
var crypto = require('crypto');

var asn1 = require('asn1');
var ctype = require('ctype');



///--- Helpers

function readNext(buffer, offset) {
  var len = ctype.ruint32(buffer, 'big', offset);
  offset += 4;

  var newOffset = offset + len;

  return {
    data: buffer.slice(offset, newOffset),
    offset: newOffset
  };
}


function writeInt(writer, buffer) {
  writer.writeByte(0x02); // ASN1.Integer
  writer.writeLength(buffer.length);

  for (var i = 0; i < buffer.length; i++)
    writer.writeByte(buffer[i]);

  return writer;
}


function rsaToPEM(key) {
  var buffer;
  var der;
  var exponent;
  var i;
  var modulus;
  var newKey = '';
  var offset = 0;
  var type;
  var tmp;

  try {
    buffer = new Buffer(key.split(' ')[1], 'base64');

    tmp = readNext(buffer, offset);
    type = tmp.data.toString();
    offset = tmp.offset;

    if (type !== 'ssh-rsa')
      throw new Error('Invalid ssh key type: ' + type);

    tmp = readNext(buffer, offset);
    exponent = tmp.data;
    offset = tmp.offset;

    tmp = readNext(buffer, offset);
    modulus = tmp.data;
  } catch (e) {
    throw new Error('Invalid ssh key: ' + key);
  }

  // DER is a subset of BER
  der = new asn1.BerWriter();

  der.startSequence();

  der.startSequence();
  der.writeOID('1.2.840.113549.1.1.1');
  der.writeNull();
  der.endSequence();

  der.startSequence(0x03); // bit string
  der.writeByte(0x00);

  // Actual key
  der.startSequence();
  writeInt(der, modulus);
  writeInt(der, exponent);
  der.endSequence();

  // bit string
  der.endSequence();

  der.endSequence();

  tmp = der.buffer.toString('base64');
  for (i = 0; i < tmp.length; i++) {
    if ((i % 64) === 0)
      newKey += '\n';
    newKey += tmp.charAt(i);
  }

  if (!/\\n$/.test(newKey))
    newKey += '\n';

  return '-----BEGIN PUBLIC KEY-----' + newKey + '-----END PUBLIC KEY-----\n';
}


function dsaToPEM(key) {
  var buffer;
  var offset = 0;
  var tmp;
  var der;
  var newKey = '';

  var type;
  var p;
  var q;
  var g;
  var y;

  try {
    buffer = new Buffer(key.split(' ')[1], 'base64');

    tmp = readNext(buffer, offset);
    type = tmp.data.toString();
    offset = tmp.offset;

    /* JSSTYLED */
    if (!/^ssh-ds[as].*/.test(type))
      throw new Error('Invalid ssh key type: ' + type);

    tmp = readNext(buffer, offset);
    p = tmp.data;
    offset = tmp.offset;

    tmp = readNext(buffer, offset);
    q = tmp.data;
    offset = tmp.offset;

    tmp = readNext(buffer, offset);
    g = tmp.data;
    offset = tmp.offset;

    tmp = readNext(buffer, offset);
    y = tmp.data;
  } catch (e) {
    console.log(e.stack);
    throw new Error('Invalid ssh key: ' + key);
  }

  // DER is a subset of BER
  der = new asn1.BerWriter();

  der.startSequence();

  der.startSequence();
  der.writeOID('1.2.840.10040.4.1');

  der.startSequence();
  writeInt(der, p);
  writeInt(der, q);
  writeInt(der, g);
  der.endSequence();

  der.endSequence();

  der.startSequence(0x03); // bit string
  der.writeByte(0x00);
  writeInt(der, y);
  der.endSequence();

  der.endSequence();

  tmp = der.buffer.toString('base64');
  for (var i = 0; i < tmp.length; i++) {
    if ((i % 64) === 0)
      newKey += '\n';
    newKey += tmp.charAt(i);
  }

  if (!/\\n$/.test(newKey))
    newKey += '\n';

  return '-----BEGIN PUBLIC KEY-----' + newKey + '-----END PUBLIC KEY-----\n';
}


///--- API

module.exports = {

  /**
   * Converts an OpenSSH public key (rsa only) to a PKCS#8 PEM file.
   *
   * The intent of this module is to interoperate with OpenSSL only,
   * specifically the node crypto module's `verify` method.
   *
   * @param {String} key an OpenSSH public key.
   * @return {String} PEM encoded form of the RSA public key.
   * @throws {TypeError} on bad input.
   * @throws {Error} on invalid ssh key formatted data.
   */
  sshKeyToPEM: function sshKeyToPEM(key) {
    assert.string(key, 'ssh_key');

    /* JSSTYLED */
    if (/^ssh-rsa.*/.test(key))
      return rsaToPEM(key);

    /* JSSTYLED */
    if (/^ssh-ds[as].*/.test(key))
      return dsaToPEM(key);

    throw new Error('Only RSA and DSA public keys are allowed');
  },


  /**
   * Generates an OpenSSH fingerprint from an ssh public key.
   *
   * @param {String} key an OpenSSH public key.
   * @return {String} key fingerprint.
   * @throws {TypeError} on bad input.
   * @throws {Error} if what you passed doesn't look like an ssh public key.
   */
  fingerprint: function fingerprint(key) {
    assert.string(key, 'ssh_key');

    var pieces = key.split(' ');
    if (!pieces || !pieces.length || pieces.length < 2)
      throw new Error('invalid ssh key');

    var data = new Buffer(pieces[1], 'base64');

    var hash = crypto.createHash('md5');
    hash.update(data);
    var digest = hash.digest('hex');

    var fp = '';
    for (var i = 0; i < digest.length; i++) {
      if (i && i % 2 === 0)
        fp += ':';

      fp += digest[i];
    }

    return fp;
  },

  /**
   * Converts a PKGCS#8 PEM file to an OpenSSH public key (rsa)
   *
   * The reverse of the above function.
   */
  pemToRsaSSHKey: function pemToRsaSSHKey(pem, comment) {
    assert.equal('string', typeof (pem), 'typeof pem');

    // chop off the BEGIN PUBLIC KEY and END PUBLIC KEY portion
    var cleaned = pem.split('\n').slice(1, -2).join('');

    var buf = new Buffer(cleaned, 'base64');

    var der = new asn1.BerReader(buf);

    der.readSequence();
    der.readSequence();

    var oid = der.readOID();
    assert.equal(oid, '1.2.840.113549.1.1.1', 'pem not in RSA format');

    // Null -- XXX this probably isn't good practice
    der.readByte();
    der.readByte();

    // bit string sequence
    der.readSequence(0x03);
    der.readByte();
    der.readSequence();

    // modulus
    assert.equal(der.peek(), asn1.Ber.Integer, 'modulus not an integer');
    der._offset = der.readLength(der.offset + 1);
    var modulus = der._buf.slice(der.offset, der.offset + der.length);
    der._offset += der.length;

    // exponent
    assert.equal(der.peek(), asn1.Ber.Integer, 'exponent not an integer');
    der._offset = der.readLength(der.offset + 1);
    var exponent = der._buf.slice(der.offset, der.offset + der.length);
    der._offset += der.length;

    // now, make the key
    var type = new Buffer('ssh-rsa');
    var buffer = new Buffer(4 + type.length + 4 + modulus.length +
      4 + exponent.length);
    var i = 0;
    buffer.writeUInt32BE(type.length, i);     i += 4;
    type.copy(buffer, i);                     i += type.length;
    buffer.writeUInt32BE(exponent.length, i); i += 4;
    exponent.copy(buffer, i);                 i += exponent.length;
    buffer.writeUInt32BE(modulus.length, i);  i += 4;
    modulus.copy(buffer, i);                  i += modulus.length;

    var s = (type.toString() + ' ' + buffer.toString('base64') + ' ' +
      (comment || ''));
    return s;
  }
};

},{"asn1":86,"assert-plus":87,"crypto":undefined,"ctype":90}],80:[function(require,module,exports){
// Copyright 2015 Joyent, Inc.

var assert = require('assert-plus');
var crypto = require('crypto');



///--- Exported API

module.exports = {
  /**
   * Verify RSA/DSA signature against public key.  You are expected to pass in
   * an object that was returned from `parse()`.
   *
   * @param {Object} parsedSignature the object you got from `parse`.
   * @param {String} pubkey RSA/DSA private key PEM.
   * @return {Boolean} true if valid, false otherwise.
   * @throws {TypeError} if you pass in bad arguments.
   */
  verifySignature: function verifySignature(parsedSignature, pubkey) {
    assert.object(parsedSignature, 'parsedSignature');
    assert.string(pubkey, 'pubkey');

    var alg = parsedSignature.algorithm.match(/^(RSA|DSA)-(\w+)/);
    if (!alg || alg.length !== 3)
      throw new TypeError('parsedSignature: unsupported algorithm ' +
                          parsedSignature.algorithm);

    var verify = crypto.createVerify(alg[0]);
    verify.update(parsedSignature.signingString);
    return verify.verify(pubkey, parsedSignature.params.signature, 'base64');
  },

  /**
   * Verify HMAC against shared secret.  You are expected to pass in an object
   * that was returned from `parse()`.
   *
   * @param {Object} parsedSignature the object you got from `parse`.
   * @param {String} secret HMAC shared secret.
   * @return {Boolean} true if valid, false otherwise.
   * @throws {TypeError} if you pass in bad arguments.
   */
  verifyHMAC: function verifyHMAC(parsedSignature, secret) {
    assert.object(parsedSignature, 'parsedHMAC');
    assert.string(secret, 'secret');

    var alg = parsedSignature.algorithm.match(/^HMAC-(\w+)/);
    if (!alg || alg.length !== 2)
      throw new TypeError('parsedSignature: unsupported algorithm ' +
                          parsedSignature.algorithm);

    var hmac = crypto.createHmac(alg[1].toUpperCase(), secret);
    hmac.update(parsedSignature.signingString);
    return (hmac.digest('base64') === parsedSignature.params.signature);
  }
};

},{"assert-plus":87,"crypto":undefined}],81:[function(require,module,exports){
// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.


module.exports = {

  newInvalidAsn1Error: function(msg) {
    var e = new Error();
    e.name = 'InvalidAsn1Error';
    e.message = msg || '';
    return e;
  }

};

},{}],82:[function(require,module,exports){
// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

var errors = require('./errors');
var types = require('./types');

var Reader = require('./reader');
var Writer = require('./writer');


///--- Exports

module.exports = {

  Reader: Reader,

  Writer: Writer

};

for (var t in types) {
  if (types.hasOwnProperty(t))
    module.exports[t] = types[t];
}
for (var e in errors) {
  if (errors.hasOwnProperty(e))
    module.exports[e] = errors[e];
}

},{"./errors":81,"./reader":83,"./types":84,"./writer":85}],83:[function(require,module,exports){
// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

var assert = require('assert');

var ASN1 = require('./types');
var errors = require('./errors');


///--- Globals

var newInvalidAsn1Error = errors.newInvalidAsn1Error;



///--- API

function Reader(data) {
  if (!data || !Buffer.isBuffer(data))
    throw new TypeError('data must be a node Buffer');

  this._buf = data;
  this._size = data.length;

  // These hold the "current" state
  this._len = 0;
  this._offset = 0;

  var self = this;
  this.__defineGetter__('length', function() { return self._len; });
  this.__defineGetter__('offset', function() { return self._offset; });
  this.__defineGetter__('remain', function() {
    return self._size - self._offset;
  });
  this.__defineGetter__('buffer', function() {
    return self._buf.slice(self._offset);
  });
}


/**
 * Reads a single byte and advances offset; you can pass in `true` to make this
 * a "peek" operation (i.e., get the byte, but don't advance the offset).
 *
 * @param {Boolean} peek true means don't move offset.
 * @return {Number} the next byte, null if not enough data.
 */
Reader.prototype.readByte = function(peek) {
  if (this._size - this._offset < 1)
    return null;

  var b = this._buf[this._offset] & 0xff;

  if (!peek)
    this._offset += 1;

  return b;
};


Reader.prototype.peek = function() {
  return this.readByte(true);
};


/**
 * Reads a (potentially) variable length off the BER buffer.  This call is
 * not really meant to be called directly, as callers have to manipulate
 * the internal buffer afterwards.
 *
 * As a result of this call, you can call `Reader.length`, until the
 * next thing called that does a readLength.
 *
 * @return {Number} the amount of offset to advance the buffer.
 * @throws {InvalidAsn1Error} on bad ASN.1
 */
Reader.prototype.readLength = function(offset) {
  if (offset === undefined)
    offset = this._offset;

  if (offset >= this._size)
    return null;

  var lenB = this._buf[offset++] & 0xff;
  if (lenB === null)
    return null;

  if ((lenB & 0x80) == 0x80) {
    lenB &= 0x7f;

    if (lenB == 0)
      throw newInvalidAsn1Error('Indefinite length not supported');

    if (lenB > 4)
      throw newInvalidAsn1Error('encoding too long');

    if (this._size - offset < lenB)
      return null;

    this._len = 0;
    for (var i = 0; i < lenB; i++)
      this._len = (this._len << 8) + (this._buf[offset++] & 0xff);

  } else {
    // Wasn't a variable length
    this._len = lenB;
  }

  return offset;
};


/**
 * Parses the next sequence in this BER buffer.
 *
 * To get the length of the sequence, call `Reader.length`.
 *
 * @return {Number} the sequence's tag.
 */
Reader.prototype.readSequence = function(tag) {
  var seq = this.peek();
  if (seq === null)
    return null;
  if (tag !== undefined && tag !== seq)
    throw newInvalidAsn1Error('Expected 0x' + tag.toString(16) +
                              ': got 0x' + seq.toString(16));

  var o = this.readLength(this._offset + 1); // stored in `length`
  if (o === null)
    return null;

  this._offset = o;
  return seq;
};


Reader.prototype.readInt = function() {
  return this._readTag(ASN1.Integer);
};


Reader.prototype.readBoolean = function() {
  return (this._readTag(ASN1.Boolean) === 0 ? false : true);
};


Reader.prototype.readEnumeration = function() {
  return this._readTag(ASN1.Enumeration);
};


Reader.prototype.readString = function(tag, retbuf) {
  if (!tag)
    tag = ASN1.OctetString;

  var b = this.peek();
  if (b === null)
    return null;

  if (b !== tag)
    throw newInvalidAsn1Error('Expected 0x' + tag.toString(16) +
                              ': got 0x' + b.toString(16));

  var o = this.readLength(this._offset + 1); // stored in `length`

  if (o === null)
    return null;

  if (this.length > this._size - o)
    return null;

  this._offset = o;

  if (this.length === 0)
    return '';

  var str = this._buf.slice(this._offset, this._offset + this.length);
  this._offset += this.length;

  return retbuf ? str : str.toString('utf8');
};

Reader.prototype.readOID = function(tag) {
  if (!tag)
    tag = ASN1.OID;

  var b = this.peek();
  if (b === null)
    return null;

  if (b !== tag)
    throw newInvalidAsn1Error('Expected 0x' + tag.toString(16) +
                              ': got 0x' + b.toString(16));

  var o = this.readLength(this._offset + 1); // stored in `length`
  if (o === null)
    return null;

  if (this.length > this._size - o)
    return null;

  this._offset = o;

  var values = [];
  var value = 0;

  for (var i = 0; i < this.length; i++) {
    var byte = this._buf[this._offset++] & 0xff;

    value <<= 7;
    value += byte & 0x7f;
    if ((byte & 0x80) == 0) {
      values.push(value);
      value = 0;
    }
  }

  value = values.shift();
  values.unshift(value % 40);
  values.unshift((value / 40) >> 0);

  return values.join('.');
};


Reader.prototype._readTag = function(tag) {
  assert.ok(tag !== undefined);

  var b = this.peek();

  if (b === null)
    return null;

  if (b !== tag)
    throw newInvalidAsn1Error('Expected 0x' + tag.toString(16) +
                              ': got 0x' + b.toString(16));

  var o = this.readLength(this._offset + 1); // stored in `length`
  if (o === null)
    return null;

  if (this.length > 4)
    throw newInvalidAsn1Error('Integer too long: ' + this.length);

  if (this.length > this._size - o)
    return null;
  this._offset = o;

  var fb = this._buf[this._offset++];
  var value = 0;

  value = fb & 0x7F;
  for (var i = 1; i < this.length; i++) {
    value <<= 8;
    value |= (this._buf[this._offset++] & 0xff);
  }

  if ((fb & 0x80) == 0x80)
    value = -value;

  return value;
};



///--- Exported API

module.exports = Reader;

},{"./errors":81,"./types":84,"assert":undefined}],84:[function(require,module,exports){
// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.


module.exports = {
  EOC: 0,
  Boolean: 1,
  Integer: 2,
  BitString: 3,
  OctetString: 4,
  Null: 5,
  OID: 6,
  ObjectDescriptor: 7,
  External: 8,
  Real: 9, // float
  Enumeration: 10,
  PDV: 11,
  Utf8String: 12,
  RelativeOID: 13,
  Sequence: 16,
  Set: 17,
  NumericString: 18,
  PrintableString: 19,
  T61String: 20,
  VideotexString: 21,
  IA5String: 22,
  UTCTime: 23,
  GeneralizedTime: 24,
  GraphicString: 25,
  VisibleString: 26,
  GeneralString: 28,
  UniversalString: 29,
  CharacterString: 30,
  BMPString: 31,
  Constructor: 32,
  Context: 128
};

},{}],85:[function(require,module,exports){
// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

var assert = require('assert');
var ASN1 = require('./types');
var errors = require('./errors');


///--- Globals

var newInvalidAsn1Error = errors.newInvalidAsn1Error;

var DEFAULT_OPTS = {
  size: 1024,
  growthFactor: 8
};


///--- Helpers

function merge(from, to) {
  assert.ok(from);
  assert.equal(typeof(from), 'object');
  assert.ok(to);
  assert.equal(typeof(to), 'object');

  var keys = Object.getOwnPropertyNames(from);
  keys.forEach(function(key) {
    if (to[key])
      return;

    var value = Object.getOwnPropertyDescriptor(from, key);
    Object.defineProperty(to, key, value);
  });

  return to;
}



///--- API

function Writer(options) {
  options = merge(DEFAULT_OPTS, options || {});

  this._buf = new Buffer(options.size || 1024);
  this._size = this._buf.length;
  this._offset = 0;
  this._options = options;

  // A list of offsets in the buffer where we need to insert
  // sequence tag/len pairs.
  this._seq = [];

  var self = this;
  this.__defineGetter__('buffer', function() {
    if (self._seq.length)
      throw new InvalidAsn1Error(self._seq.length + ' unended sequence(s)');

    return self._buf.slice(0, self._offset);
  });
}


Writer.prototype.writeByte = function(b) {
  if (typeof(b) !== 'number')
    throw new TypeError('argument must be a Number');

  this._ensure(1);
  this._buf[this._offset++] = b;
};


Writer.prototype.writeInt = function(i, tag) {
  if (typeof(i) !== 'number')
    throw new TypeError('argument must be a Number');
  if (typeof(tag) !== 'number')
    tag = ASN1.Integer;

  var sz = 4;

  while ((((i & 0xff800000) === 0) || ((i & 0xff800000) === 0xff800000)) &&
         (sz > 1)) {
    sz--;
    i <<= 8;
  }

  if (sz > 4)
    throw new InvalidAsn1Error('BER ints cannot be > 0xffffffff');

  this._ensure(2 + sz);
  this._buf[this._offset++] = tag;
  this._buf[this._offset++] = sz;

  while (sz-- > 0) {
    this._buf[this._offset++] = ((i & 0xff000000) >> 24);
    i <<= 8;
  }

};


Writer.prototype.writeNull = function() {
  this.writeByte(ASN1.Null);
  this.writeByte(0x00);
};


Writer.prototype.writeEnumeration = function(i, tag) {
  if (typeof(i) !== 'number')
    throw new TypeError('argument must be a Number');
  if (typeof(tag) !== 'number')
    tag = ASN1.Enumeration;

  return this.writeInt(i, tag);
};


Writer.prototype.writeBoolean = function(b, tag) {
  if (typeof(b) !== 'boolean')
    throw new TypeError('argument must be a Boolean');
  if (typeof(tag) !== 'number')
    tag = ASN1.Boolean;

  this._ensure(3);
  this._buf[this._offset++] = tag;
  this._buf[this._offset++] = 0x01;
  this._buf[this._offset++] = b ? 0xff : 0x00;
};


Writer.prototype.writeString = function(s, tag) {
  if (typeof(s) !== 'string')
    throw new TypeError('argument must be a string (was: ' + typeof(s) + ')');
  if (typeof(tag) !== 'number')
    tag = ASN1.OctetString;

  var len = Buffer.byteLength(s);
  this.writeByte(tag);
  this.writeLength(len);
  if (len) {
    this._ensure(len);
    this._buf.write(s, this._offset);
    this._offset += len;
  }
};


Writer.prototype.writeBuffer = function(buf, tag) {
  if (typeof(tag) !== 'number')
    throw new TypeError('tag must be a number');
  if (!Buffer.isBuffer(buf))
    throw new TypeError('argument must be a buffer');

  this.writeByte(tag);
  this.writeLength(buf.length);
  this._ensure(buf.length);
  buf.copy(this._buf, this._offset, 0, buf.length);
  this._offset += buf.length;
};


Writer.prototype.writeStringArray = function(strings) {
  if ((!strings instanceof Array))
    throw new TypeError('argument must be an Array[String]');

  var self = this;
  strings.forEach(function(s) {
    self.writeString(s);
  });
};

// This is really to solve DER cases, but whatever for now
Writer.prototype.writeOID = function(s, tag) {
  if (typeof(s) !== 'string')
    throw new TypeError('argument must be a string');
  if (typeof(tag) !== 'number')
    tag = ASN1.OID;

  if (!/^([0-9]+\.){3,}[0-9]+$/.test(s))
    throw new Error('argument is not a valid OID string');

  function encodeOctet(bytes, octet) {
    if (octet < 128) {
        bytes.push(octet);
    } else if (octet < 16384) {
        bytes.push((octet >>> 7) | 0x80);
        bytes.push(octet & 0x7F);
    } else if (octet < 2097152) {
      bytes.push((octet >>> 14) | 0x80);
      bytes.push(((octet >>> 7) | 0x80) & 0xFF);
      bytes.push(octet & 0x7F);
    } else if (octet < 268435456) {
      bytes.push((octet >>> 21) | 0x80);
      bytes.push(((octet >>> 14) | 0x80) & 0xFF);
      bytes.push(((octet >>> 7) | 0x80) & 0xFF);
      bytes.push(octet & 0x7F);
    } else {
      bytes.push(((octet >>> 28) | 0x80) & 0xFF);
      bytes.push(((octet >>> 21) | 0x80) & 0xFF);
      bytes.push(((octet >>> 14) | 0x80) & 0xFF);
      bytes.push(((octet >>> 7) | 0x80) & 0xFF);
      bytes.push(octet & 0x7F);
    }
  }

  var tmp = s.split('.');
  var bytes = [];
  bytes.push(parseInt(tmp[0], 10) * 40 + parseInt(tmp[1], 10));
  tmp.slice(2).forEach(function(b) {
    encodeOctet(bytes, parseInt(b, 10));
  });

  var self = this;
  this._ensure(2 + bytes.length);
  this.writeByte(tag);
  this.writeLength(bytes.length);
  bytes.forEach(function(b) {
    self.writeByte(b);
  });
};


Writer.prototype.writeLength = function(len) {
  if (typeof(len) !== 'number')
    throw new TypeError('argument must be a Number');

  this._ensure(4);

  if (len <= 0x7f) {
    this._buf[this._offset++] = len;
  } else if (len <= 0xff) {
    this._buf[this._offset++] = 0x81;
    this._buf[this._offset++] = len;
  } else if (len <= 0xffff) {
    this._buf[this._offset++] = 0x82;
    this._buf[this._offset++] = len >> 8;
    this._buf[this._offset++] = len;
  } else if (len <= 0xffffff) {
    this._shift(start, len, 1);
    this._buf[this._offset++] = 0x83;
    this._buf[this._offset++] = len >> 16;
    this._buf[this._offset++] = len >> 8;
    this._buf[this._offset++] = len;
  } else {
    throw new InvalidAsn1ERror('Length too long (> 4 bytes)');
  }
};

Writer.prototype.startSequence = function(tag) {
  if (typeof(tag) !== 'number')
    tag = ASN1.Sequence | ASN1.Constructor;

  this.writeByte(tag);
  this._seq.push(this._offset);
  this._ensure(3);
  this._offset += 3;
};


Writer.prototype.endSequence = function() {
  var seq = this._seq.pop();
  var start = seq + 3;
  var len = this._offset - start;

  if (len <= 0x7f) {
    this._shift(start, len, -2);
    this._buf[seq] = len;
  } else if (len <= 0xff) {
    this._shift(start, len, -1);
    this._buf[seq] = 0x81;
    this._buf[seq + 1] = len;
  } else if (len <= 0xffff) {
    this._buf[seq] = 0x82;
    this._buf[seq + 1] = len >> 8;
    this._buf[seq + 2] = len;
  } else if (len <= 0xffffff) {
    this._shift(start, len, 1);
    this._buf[seq] = 0x83;
    this._buf[seq + 1] = len >> 16;
    this._buf[seq + 2] = len >> 8;
    this._buf[seq + 3] = len;
  } else {
    throw new InvalidAsn1Error('Sequence too long');
  }
};


Writer.prototype._shift = function(start, len, shift) {
  assert.ok(start !== undefined);
  assert.ok(len !== undefined);
  assert.ok(shift);

  this._buf.copy(this._buf, start + shift, start, start + len);
  this._offset += shift;
};

Writer.prototype._ensure = function(len) {
  assert.ok(len);

  if (this._size - this._offset < len) {
    var sz = this._size * this._options.growthFactor;
    if (sz - this._offset < len)
      sz += len;

    var buf = new Buffer(sz);

    this._buf.copy(buf, 0, 0, this._offset);
    this._buf = buf;
    this._size = sz;
  }
};



///--- Exported API

module.exports = Writer;

},{"./errors":81,"./types":84,"assert":undefined}],86:[function(require,module,exports){
// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

// If you have no idea what ASN.1 or BER is, see this:
// ftp://ftp.rsa.com/pub/pkcs/ascii/layman.asc

var Ber = require('./ber/index');



///--- Exported API

module.exports = {

  Ber: Ber,

  BerReader: Ber.Reader,

  BerWriter: Ber.Writer

};

},{"./ber/index":82}],87:[function(require,module,exports){
// Copyright (c) 2012, Mark Cavage. All rights reserved.

var assert = require('assert');
var Stream = require('stream').Stream;
var util = require('util');



///--- Globals

var NDEBUG = process.env.NODE_NDEBUG || false;
var UUID_REGEXP = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;



///--- Messages

var ARRAY_TYPE_REQUIRED = '%s ([%s]) required';
var TYPE_REQUIRED = '%s (%s) is required';



///--- Internal

function capitalize(str) {
        return (str.charAt(0).toUpperCase() + str.slice(1));
}

function uncapitalize(str) {
        return (str.charAt(0).toLowerCase() + str.slice(1));
}

function _() {
        return (util.format.apply(util, arguments));
}


function _assert(arg, type, name, stackFunc) {
        if (!NDEBUG) {
                name = name || type;
                stackFunc = stackFunc || _assert.caller;
                var t = typeof (arg);

                if (t !== type) {
                        throw new assert.AssertionError({
                                message: _(TYPE_REQUIRED, name, type),
                                actual: t,
                                expected: type,
                                operator: '===',
                                stackStartFunction: stackFunc
                        });
                }
        }
}


function _instanceof(arg, type, name, stackFunc) {
        if (!NDEBUG) {
                name = name || type;
                stackFunc = stackFunc || _instanceof.caller;

                if (!(arg instanceof type)) {
                        throw new assert.AssertionError({
                                message: _(TYPE_REQUIRED, name, type.name),
                                actual: _getClass(arg),
                                expected: type.name,
                                operator: 'instanceof',
                                stackStartFunction: stackFunc
                        });
                }
        }
}

function _getClass(object) {
        return (Object.prototype.toString.call(object).slice(8, -1));
};



///--- API

function array(arr, type, name) {
        if (!NDEBUG) {
                name = name || type;

                if (!Array.isArray(arr)) {
                        throw new assert.AssertionError({
                                message: _(ARRAY_TYPE_REQUIRED, name, type),
                                actual: typeof (arr),
                                expected: 'array',
                                operator: 'Array.isArray',
                                stackStartFunction: array.caller
                        });
                }

                for (var i = 0; i < arr.length; i++) {
                        _assert(arr[i], type, name, array);
                }
        }
}


function bool(arg, name) {
        _assert(arg, 'boolean', name, bool);
}


function buffer(arg, name) {
        if (!Buffer.isBuffer(arg)) {
                throw new assert.AssertionError({
                        message: _(TYPE_REQUIRED, name || '', 'Buffer'),
                        actual: typeof (arg),
                        expected: 'buffer',
                        operator: 'Buffer.isBuffer',
                        stackStartFunction: buffer
                });
        }
}


function func(arg, name) {
        _assert(arg, 'function', name);
}


function number(arg, name) {
        _assert(arg, 'number', name);
        if (!NDEBUG && (isNaN(arg) || !isFinite(arg))) {
                throw new assert.AssertionError({
                        message: _(TYPE_REQUIRED, name, 'number'),
                        actual: arg,
                        expected: 'number',
                        operator: 'isNaN',
                        stackStartFunction: number
                });
        }
}


function object(arg, name) {
        _assert(arg, 'object', name);
}


function stream(arg, name) {
        _instanceof(arg, Stream, name);
}


function date(arg, name) {
        _instanceof(arg, Date, name);
}

function regexp(arg, name) {
        _instanceof(arg, RegExp, name);
}


function string(arg, name) {
        _assert(arg, 'string', name);
}


function uuid(arg, name) {
        string(arg, name);
        if (!NDEBUG && !UUID_REGEXP.test(arg)) {
                throw new assert.AssertionError({
                        message: _(TYPE_REQUIRED, name, 'uuid'),
                        actual: 'string',
                        expected: 'uuid',
                        operator: 'test',
                        stackStartFunction: uuid
                });
        }
}


///--- Exports

module.exports = {
        bool: bool,
        buffer: buffer,
        date: date,
        func: func,
        number: number,
        object: object,
        regexp: regexp,
        stream: stream,
        string: string,
        uuid: uuid
};


Object.keys(module.exports).forEach(function (k) {
        if (k === 'buffer')
                return;

        var name = 'arrayOf' + capitalize(k);

        if (k === 'bool')
                k = 'boolean';
        if (k === 'func')
                k = 'function';
        module.exports[name] = function (arg, name) {
                array(arg, k, name);
        };
});

Object.keys(module.exports).forEach(function (k) {
        var _name = 'optional' + capitalize(k);
        var s = uncapitalize(k.replace('arrayOf', ''));
        if (s === 'bool')
                s = 'boolean';
        if (s === 'func')
                s = 'function';

        if (k.indexOf('arrayOf') !== -1) {
          module.exports[_name] = function (arg, name) {
                  if (!NDEBUG && arg !== undefined) {
                          array(arg, s, name);
                  }
          };
        } else {
          module.exports[_name] = function (arg, name) {
                  if (!NDEBUG && arg !== undefined) {
                          _assert(arg, s, name);
                  }
          };
        }
});


// Reexport built-in assertions
Object.keys(assert).forEach(function (k) {
        if (k === 'AssertionError') {
                module.exports[k] = assert[k];
                return;
        }

        module.exports[k] = function () {
                if (!NDEBUG) {
                        assert[k].apply(assert[k], arguments);
                }
        };
});

},{"assert":undefined,"stream":undefined,"util":undefined}],88:[function(require,module,exports){
/*
 * ctf.js
 *
 * Understand and parse all of the different JSON formats of CTF data and
 * translate that into a series of node-ctype friendly pieces. The reason for
 * the abstraction is to handle different changes in the file format.
 *
 * We have to be careful here that we don't end up using a name that is already
 * a built in type.
 */
var mod_assert = require('assert');
var ASSERT = mod_assert.ok;

var ctf_versions = [ '1.0' ];
var ctf_entries = [ 'integer', 'float', 'typedef', 'struct' ];
var ctf_deftypes = [ 'int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t',
    'uint32_t', 'float', 'double' ];

function ctfParseInteger(entry, ctype)
{
	var name, sign, len, type;

	name = entry['name'];
	if (!('signed' in entry['integer']))
		throw (new Error('Malformed CTF JSON: integer missing ' +
		    'signed value'));


	if (!('length' in entry['integer']))
		throw (new Error('Malformed CTF JSON: integer missing ' +
		    'length value'));

	sign = entry['integer']['signed'];
	len = entry['integer']['length'];
	type = null;

	if (sign && len == 1)
		type = 'int8_t';
	else if (len == 1)
		type = 'uint8_t';
	else if (sign && len == 2)
		type = 'int16_t';
	else if (len == 2)
		type = 'uint16_t';
	else if (sign && len == 4)
		type = 'int32_t';
	else if (len == 4)
		type = 'uint32_t';
	else if (sign && len == 8)
		type = 'int64_t';
	else if (len == 8)
		type = 'uint64_t';

	if (type === null)
		throw (new Error('Malformed CTF JSON: integer has ' +
		    'unsupported length and sign - ' + len + '/' + sign));

	/*
	 * This means that this is the same as one of our built in types. If
	 * that's the case defining it would be an error. So instead of trying
	 * to typedef it, we'll return here.
	 */
	if (name == type)
		return;

	if (name == 'char') {
		ASSERT(type == 'int8_t');
		return;
	}

	ctype.typedef(name, type);
}

function ctfParseFloat(entry, ctype)
{
	var name, len;

	name = entry['name'];
	if (!('length' in entry['float']))
		throw (new Error('Malformed CTF JSON: float missing ' +
		    'length value'));

	len = entry['float']['length'];
	if (len != 4 && len != 8)
		throw (new Error('Malformed CTF JSON: float has invalid ' +
		    'length value'));

	if (len == 4) {
		if (name == 'float')
			return;
		ctype.typedef(name, 'float');
	} else if (len == 8) {
		if (name == 'double')
			return;
		ctype.typedef(name, 'double');
	}
}

function ctfParseTypedef(entry, ctype)
{
	var name, type, ii;

	name = entry['name'];
	if (typeof (entry['typedef']) != 'string')
		throw (new Error('Malformed CTF JSON: typedef value in not ' +
		    'a string'));

	type = entry['typedef'];

	/*
	 * We need to ensure that we're not looking at type that's one of our
	 * built in types. Traditionally in C a uint32_t would be a typedef to
	 * some kind of integer. However, those size types are built ins.
	 */
	for (ii = 0; ii < ctf_deftypes.length; ii++) {
		if (name == ctf_deftypes[ii])
			return;
	}

	ctype.typedef(name, type);
}

function ctfParseStruct(entry, ctype)
{
	var name, type, ii, val, index, member, push;

	member = [];
	if (!Array.isArray(entry['struct']))
		throw (new Error('Malformed CTF JSON: struct value is not ' +
		    'an array'));

	for (ii = 0; ii < entry['struct'].length; ii++) {
		val = entry['struct'][ii];
		if (!('name' in val))
			throw (new Error('Malformed CTF JSON: struct member ' +
			    'missing name'));

		if (!('type' in val))
			throw (new Error('Malformed CTF JSON: struct member ' +
			    'missing type'));

		if (typeof (val['name']) != 'string')
			throw (new Error('Malformed CTF JSON: struct member ' +
			    'name isn\'t a string'));

		if (typeof (val['type']) != 'string')
			throw (new Error('Malformed CTF JSON: struct member ' +
			    'type isn\'t a string'));

		/*
		 * CTF version 2 specifies array names as <type> [<num>] where
		 * as node-ctype does this as <type>[<num>].
		 */
		name = val['name'];
		type = val['type'];
		index = type.indexOf(' [');
		if (index != -1) {
			type = type.substring(0, index) +
			    type.substring(index + 1, type.length);
		}
		push = {};
		push[name] = { 'type': type };
		member.push(push);
	}

	name = entry['name'];
	ctype.typedef(name, member);
}

function ctfParseEntry(entry, ctype)
{
	var ii, found;

	if (!('name' in entry))
		throw (new Error('Malformed CTF JSON: entry missing "name" ' +
		    'section'));

	for (ii = 0; ii < ctf_entries.length; ii++) {
		if (ctf_entries[ii] in entry)
			found++;
	}

	if (found === 0)
		throw (new Error('Malformed CTF JSON: found no entries'));

	if (found >= 2)
		throw (new Error('Malformed CTF JSON: found more than one ' +
		    'entry'));

	if ('integer' in entry) {
		ctfParseInteger(entry, ctype);
		return;
	}

	if ('float' in entry) {
		ctfParseFloat(entry, ctype);
		return;
	}

	if ('typedef' in entry) {
		ctfParseTypedef(entry, ctype);
		return;
	}

	if ('struct' in entry) {
		ctfParseStruct(entry, ctype);
		return;
	}

	ASSERT(false, 'shouldn\'t reach here');
}

function ctfParseJson(json, ctype)
{
	var version, ii;

	ASSERT(json);
	ASSERT(ctype);
	if (!('metadata' in json))
		throw (new Error('Invalid CTF JSON: missing metadata section'));

	if (!('ctf2json_version' in json['metadata']))
		throw (new Error('Invalid CTF JSON: missing ctf2json_version'));

	version = json['metadata']['ctf2json_version'];
	for (ii = 0; ii < ctf_versions.length; ii++) {
		if (ctf_versions[ii] == version)
			break;
	}

	if (ii == ctf_versions.length)
		throw (new Error('Unsuported ctf2json_version: ' + version));

	if (!('data' in json))
		throw (new Error('Invalid CTF JSON: missing data section'));

	if (!Array.isArray(json['data']))
		throw (new Error('Malformed CTF JSON: data section is not ' +
		    'an array'));

	for (ii = 0; ii < json['data'].length; ii++)
		ctfParseEntry(json['data'][ii], ctype);
}

exports.ctfParseJson = ctfParseJson;

},{"assert":undefined}],89:[function(require,module,exports){
/*
 * rm - Feb 2011
 * ctio.js:
 *
 * A simple way to read and write simple ctypes. Of course, as you'll find the
 * code isn't as simple as it might appear. The following types are currently
 * supported in big and little endian formats:
 *
 * 	uint8_t			int8_t
 * 	uint16_t		int16_t
 * 	uint32_t		int32_t
 *	float (single precision IEEE 754)
 *	double (double precision IEEE 754)
 *
 * This is designed to work in Node and v8. It may in fact work in other
 * Javascript interpreters (that'd be pretty neat), but it hasn't been tested.
 * If you find that it does in fact work, that's pretty cool. Try and pass word
 * back to the original author.
 *
 * Note to the reader: If you're tabstop isn't set to 8, parts of this may look
 * weird.
 */

/*
 * Numbers in Javascript have a secret: all numbers must be represented with an
 * IEEE-754 double. The double has a mantissa with a length of 52 bits with an
 * implicit one. Thus the range of integers that can be represented is limited
 * to the size of the mantissa, this makes reading and writing 64-bit integers
 * difficult, but far from impossible.
 *
 * Another side effect of this representation is what happens when you use the
 * bitwise operators, i.e. shift left, shift right, and, or, etc. In Javascript,
 * each operand and the result is cast to a signed 32-bit number. However, in
 * the case of >>> the values are cast to an unsigned number.
 */

/*
 * A reminder on endian related issues:
 *
 * Big Endian: MSB -> First byte
 * Little Endian: MSB->Last byte
 */
var mod_assert = require('assert');

/*
 * An 8 bit unsigned integer involves doing no significant work.
 */
function ruint8(buffer, endian, offset)
{
	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	return (buffer[offset]);
}

/*
 * For 16 bit unsigned numbers we can do all the casting that we want to do.
 */
function rgint16(buffer, endian, offset)
{
	var val = 0;

	if (endian == 'big') {
		val = buffer[offset] << 8;
		val |=  buffer[offset+1];
	} else {
		val = buffer[offset];
		val |= buffer[offset+1] << 8;
	}

	return (val);

}

function ruint16(buffer, endian, offset)
{
	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 1 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	return (rgint16(buffer, endian, offset));
}

/*
 * Because most bitshifting is done using signed numbers, if we would go into
 * the realm where we use that 32nd bit, we'll end up going into the negative
 * range. i.e.:
 * > 200 << 24
 * -939524096
 *
 * Not the value you'd expect. To work around this, we end up having to do some
 * abuse of the JavaScript standard. in this case, we know that a >>> shift is
 * defined to cast our value to an *unsigned* 32-bit number. Because of that, we
 * use that instead to save us some additional math, though it does feel a
 * little weird and it isn't obvious as to why you woul dwant to do this at
 * first.
 */
function rgint32(buffer, endian, offset)
{
	var val = 0;

	if (endian == 'big') {
		val = buffer[offset+1] << 16;
		val |= buffer[offset+2] << 8;
		val |= buffer[offset+3];
		val = val + (buffer[offset] << 24 >>> 0);
	} else {
		val = buffer[offset+2] << 16;
		val |= buffer[offset+1] << 8;
		val |= buffer[offset];
		val = val + (buffer[offset + 3] << 24 >>> 0);
	}

	return (val);
}

function ruint32(buffer, endian, offset)
{
	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 3 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	return (rgint32(buffer, endian, offset));
}

/*
 * Reads a 64-bit unsigned number. The astue observer will note that this
 * doesn't quite work. Javascript has chosen to only have numbers that can be
 * represented by a double. A double only has 52 bits of mantissa with an
 * implicit 1, thus we have up to 53 bits to represent an integer. However, 2^53
 * doesn't quite give us what we want. Isn't 53 bits enough for anyone? What
 * could you have possibly wanted to represent that was larger than that? Oh,
 * maybe a size? You mean we bypassed the 4 GB limit on file sizes, when did
 * that happen?
 *
 * To get around this egregious language issue, we're going to instead construct
 * an array of two 32 bit unsigned integers. Where arr[0] << 32 + arr[1] would
 * give the actual number. However, note that the above code probably won't
 * produce the desired results because of the way Javascript numbers are
 * doubles.
 */
function rgint64(buffer, endian, offset)
{
	var val = new Array(2);

	if (endian == 'big') {
		val[0] = ruint32(buffer, endian, offset);
		val[1] = ruint32(buffer, endian, offset+4);
	} else {
		val[0] = ruint32(buffer, endian, offset+4);
		val[1] = ruint32(buffer, endian, offset);
	}

	return (val);
}

function ruint64(buffer, endian, offset)
{
	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 7 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	return (rgint64(buffer, endian, offset));
}


/*
 * Signed integer types, yay team! A reminder on how two's complement actually
 * works. The first bit is the signed bit, i.e. tells us whether or not the
 * number should be positive or negative. If the two's complement value is
 * positive, then we're done, as it's equivalent to the unsigned representation.
 *
 * Now if the number is positive, you're pretty much done, you can just leverage
 * the unsigned translations and return those. Unfortunately, negative numbers
 * aren't quite that straightforward.
 *
 * At first glance, one might be inclined to use the traditional formula to
 * translate binary numbers between the positive and negative values in two's
 * complement. (Though it doesn't quite work for the most negative value)
 * Mainly:
 *  - invert all the bits
 *  - add one to the result
 *
 * Of course, this doesn't quite work in Javascript. Take for example the value
 * of -128. This could be represented in 16 bits (big-endian) as 0xff80. But of
 * course, Javascript will do the following:
 *
 * > ~0xff80
 * -65409
 *
 * Whoh there, Javascript, that's not quite right. But wait, according to
 * Javascript that's perfectly correct. When Javascript ends up seeing the
 * constant 0xff80, it has no notion that it is actually a signed number. It
 * assumes that we've input the unsigned value 0xff80. Thus, when it does the
 * binary negation, it casts it into a signed value, (positive 0xff80). Then
 * when you perform binary negation on that, it turns it into a negative number.
 *
 * Instead, we're going to have to use the following general formula, that works
 * in a rather Javascript friendly way. I'm glad we don't support this kind of
 * weird numbering scheme in the kernel.
 *
 * (BIT-MAX - (unsigned)val + 1) * -1
 *
 * The astute observer, may think that this doesn't make sense for 8-bit numbers
 * (really it isn't necessary for them). However, when you get 16-bit numbers,
 * you do. Let's go back to our prior example and see how this will look:
 *
 * (0xffff - 0xff80 + 1) * -1
 * (0x007f + 1) * -1
 * (0x0080) * -1
 *
 * Doing it this way ends up allowing us to treat it appropriately in
 * Javascript. Sigh, that's really quite ugly for what should just be a few bit
 * shifts, ~ and &.
 */

/*
 * Endianness doesn't matter for 8-bit signed values. We could in fact optimize
 * this case because the more traditional methods work, but for consistency,
 * we'll keep doing this the same way.
 */
function rsint8(buffer, endian, offset)
{
	var neg;

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	neg = buffer[offset] & 0x80;
	if (!neg)
		return (buffer[offset]);

	return ((0xff - buffer[offset] + 1) * -1);
}

/*
 * The 16-bit version requires a bit more effort. In this case, we can leverage
 * our unsigned code to generate the value we want to return.
 */
function rsint16(buffer, endian, offset)
{
	var neg, val;

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 1 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = rgint16(buffer, endian, offset);
	neg = val & 0x8000;
	if (!neg)
		return (val);

	return ((0xffff - val + 1) * -1);
}

/*
 * We really shouldn't leverage our 32-bit code here and instead utilize the
 * fact that we know that since these are signed numbers, we can do all the
 * shifting and binary anding to generate the 32-bit number. But, for
 * consistency we'll do the same. If we want to do otherwise, we should instead
 * make the 32 bit unsigned code do the optimization. But as long as there
 * aren't floats secretly under the hood for that, we /should/ be okay.
 */
function rsint32(buffer, endian, offset)
{
	var neg, val;

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 3 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = rgint32(buffer, endian, offset);
	neg = val & 0x80000000;
	if (!neg)
		return (val);

	return ((0xffffffff - val + 1) * -1);
}

/*
 * The signed version of this code suffers from all of the same problems of the
 * other 64 bit version.
 */
function rsint64(buffer, endian, offset)
{
	var neg, val;

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 3 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = rgint64(buffer, endian, offset);
	neg = val[0] & 0x80000000;

	if (!neg)
		return (val);

	val[0] = (0xffffffff - val[0]) * -1;
	val[1] = (0xffffffff - val[1] + 1) * -1;

	/*
	 * If we had the key 0x8000000000000000, that would leave the lower 32
	 * bits as 0xffffffff, however, since we're goint to add one, that would
	 * actually leave the lower 32-bits as 0x100000000, which would break
	 * our ability to write back a value that we received. To work around
	 * this, if we actually get that value, we're going to bump the upper
	 * portion by 1 and set this to zero.
	 */
	mod_assert.ok(val[1] <= 0x100000000);
	if (val[1] == -0x100000000) {
		val[1] = 0;
		val[0]--;
	}

	return (val);
}

/*
 * We now move onto IEEE 754: The traditional form for floating point numbers
 * and what is secretly hiding at the heart of everything in this. I really hope
 * that someone is actually using this, as otherwise, this effort is probably
 * going to be more wasted.
 *
 * One might be tempted to use parseFloat here, but that wouldn't work at all
 * for several reasons. Mostly due to the way floats actually work, and
 * parseFloat only actually works in base 10. I don't see base 10 anywhere near
 * this file.
 *
 * In this case we'll implement the single and double precision versions. The
 * quadruple precision, while probably useful, wouldn't really be accepted by
 * Javascript, so let's not even waste our time.
 *
 * So let's review how this format looks like. A single precision value is 32
 * bits and has three parts:
 *   -  Sign bit
 *   -  Exponent (Using bias notation)
 *   -  Mantissa
 *
 * |s|eeeeeeee|mmmmmmmmmmmmmmmmmmmmmmmmm|
 * 31| 30-23  |  22    	-       0       |
 *
 * The exponent is stored in a biased input. The bias in this case 127.
 * Therefore, our exponent is equal to the 8-bit value - 127.
 *
 * By default, a number is normalized in IEEE, that means that the mantissa has
 * an implicit one that we don't see. So really the value stored is 1.m.
 * However, if the exponent is all zeros, then instead we have to shift
 * everything to the right one and there is no more implicit one.
 *
 * Special values:
 *  - Positive Infinity:
 *	Sign:		0
 *	Exponent: 	All 1s
 *	Mantissa:	0
 *  - Negative Infinity:
 *	Sign:		1
 *	Exponent: 	All 1s
 *	Mantissa:	0
 *  - NaN:
 *	Sign:		*
 *	Exponent: 	All 1s
 *	Mantissa:	non-zero
 *  - Zero:
 *	Sign:		*
 *	Exponent:	All 0s
 *	Mantissa:	0
 *
 * In the case of zero, the sign bit determines whether we get a positive or
 * negative zero. However, since Javascript cannot determine the difference
 * between the two: i.e. -0 == 0, we just always return 0.
 *
 */
function rfloat(buffer, endian, offset)
{
	var bytes = [];
	var sign, exponent, mantissa, val;
	var bias = 127;
	var maxexp = 0xff;

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 3 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	/* Normalize the bytes to be in endian order */
	if (endian == 'big') {
		bytes[0] = buffer[offset];
		bytes[1] = buffer[offset+1];
		bytes[2] = buffer[offset+2];
		bytes[3] = buffer[offset+3];
	} else {
		bytes[3] = buffer[offset];
		bytes[2] = buffer[offset+1];
		bytes[1] = buffer[offset+2];
		bytes[0] = buffer[offset+3];
	}

	sign = bytes[0] & 0x80;
	exponent = (bytes[0] & 0x7f) << 1;
	exponent |= (bytes[1] & 0x80) >>> 7;
	mantissa = (bytes[1] & 0x7f) << 16;
	mantissa |= bytes[2] << 8;
	mantissa |= bytes[3];

	/* Check for special cases before we do general parsing */
	if (!sign && exponent == maxexp && mantissa === 0)
		return (Number.POSITIVE_INFINITY);

	if (sign && exponent == maxexp && mantissa === 0)
		return (Number.NEGATIVE_INFINITY);

	if (exponent == maxexp && mantissa !== 0)
		return (Number.NaN);

	/*
	 * Javascript really doesn't have support for positive or negative zero.
	 * So we're not going to try and give it to you. That would be just
	 * plain weird. Besides -0 == 0.
	 */
	if (exponent === 0 && mantissa === 0)
		return (0);

	/*
	 * Now we can deal with the bias and the determine whether the mantissa
	 * has the implicit one or not.
	 */
	exponent -= bias;
	if (exponent == -bias) {
		exponent++;
		val = 0;
	} else {
		val = 1;
	}

	val = (val + mantissa * Math.pow(2, -23)) * Math.pow(2, exponent);

	if (sign)
		val *= -1;

	return (val);
}

/*
 * Doubles in IEEE 754 are like their brothers except for a few changes and
 * increases in size:
 *   - The exponent is now 11 bits
 *   - The mantissa is now 52 bits
 *   - The bias is now 1023
 *
 * |s|eeeeeeeeeee|mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm|
 * 63| 62 - 52   | 	51		-			0     |
 * 63| 62 - 52   |      51              -                       0     |
 *
 * While the size has increased a fair amount, we're going to end up keeping the
 * same general formula for calculating the final value. As a reminder, this
 * formula is:
 *
 * (-1)^s * (n + m) * 2^(e-b)
 *
 * Where:
 *	s	is the sign bit
 *	n	is (exponent > 0) ? 1 : 0 -- Determines whether we're normalized
 *					     or not
 *	m	is the mantissa
 *	e	is the exponent specified
 *	b	is the bias for the exponent
 *
 */
function rdouble(buffer, endian, offset)
{
	var bytes = [];
	var sign, exponent, mantissa, val, lowmant;
	var bias = 1023;
	var maxexp = 0x7ff;

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 7 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	/* Normalize the bytes to be in endian order */
	if (endian == 'big') {
		bytes[0] = buffer[offset];
		bytes[1] = buffer[offset+1];
		bytes[2] = buffer[offset+2];
		bytes[3] = buffer[offset+3];
		bytes[4] = buffer[offset+4];
		bytes[5] = buffer[offset+5];
		bytes[6] = buffer[offset+6];
		bytes[7] = buffer[offset+7];
	} else {
		bytes[7] = buffer[offset];
		bytes[6] = buffer[offset+1];
		bytes[5] = buffer[offset+2];
		bytes[4] = buffer[offset+3];
		bytes[3] = buffer[offset+4];
		bytes[2] = buffer[offset+5];
		bytes[1] = buffer[offset+6];
		bytes[0] = buffer[offset+7];
	}

	/*
	 * We can construct the exponent and mantissa the same way as we did in
	 * the case of a float, just increase the range of the exponent.
	 */
	sign = bytes[0] & 0x80;
	exponent = (bytes[0] & 0x7f) << 4;
	exponent |= (bytes[1] & 0xf0) >>> 4;

	/*
	 * This is going to be ugly but then again, we're dealing with IEEE 754.
	 * This could probably be done as a node add on in a few lines of C++,
	 * but oh we'll, we've made it this far so let's be native the rest of
	 * the way...
	 *
	 * What we're going to do is break the mantissa into two parts, the
	 * lower 24 bits and the upper 28 bits. We'll multiply the upper 28 bits
	 * by the appropriate power and then add in the lower 24-bits. Not
	 * really that great. It's pretty much a giant kludge to deal with
	 * Javascript eccentricities around numbers.
	 */
	lowmant = bytes[7];
	lowmant |= bytes[6] << 8;
	lowmant |= bytes[5] << 16;
	mantissa = bytes[4];
	mantissa |= bytes[3] << 8;
	mantissa |= bytes[2] << 16;
	mantissa |= (bytes[1] & 0x0f) << 24;
	mantissa *= Math.pow(2, 24); /* Equivalent to << 24, but JS compat */
	mantissa += lowmant;

	/* Check for special cases before we do general parsing */
	if (!sign && exponent == maxexp && mantissa === 0)
		return (Number.POSITIVE_INFINITY);

	if (sign && exponent == maxexp && mantissa === 0)
		return (Number.NEGATIVE_INFINITY);

	if (exponent == maxexp && mantissa !== 0)
		return (Number.NaN);

	/*
	 * Javascript really doesn't have support for positive or negative zero.
	 * So we're not going to try and give it to you. That would be just
	 * plain weird. Besides -0 == 0.
	 */
	if (exponent === 0 && mantissa === 0)
		return (0);

	/*
	 * Now we can deal with the bias and the determine whether the mantissa
	 * has the implicit one or not.
	 */
	exponent -= bias;
	if (exponent == -bias) {
		exponent++;
		val = 0;
	} else {
		val = 1;
	}

	val = (val + mantissa * Math.pow(2, -52)) * Math.pow(2, exponent);

	if (sign)
		val *= -1;

	return (val);
}

/*
 * Now that we have gone through the pain of reading the individual types, we're
 * probably going to want some way to write these back. None of this is going to
 * be good. But since we have Javascript numbers this should certainly be more
 * interesting. Though we can constrain this end a little bit more in what is
 * valid. For now, let's go back to our friends the unsigned value.
 */

/*
 * Unsigned numbers seem deceptively easy. Here are the general steps and rules
 * that we are going to take:
 *   -  If the number is negative, throw an Error
 *   -  Truncate any floating point portion
 *   -  Take the modulus of the number in our base
 *   -  Write it out to the buffer in the endian format requested at the offset
 */

/*
 * We have to make sure that the value is a valid integer. This means that it is
 * non-negative. It has no fractional component and that it does not exceed the
 * maximum allowed value.
 *
 *	value		The number to check for validity
 *
 *	max		The maximum value
 */
function prepuint(value, max)
{
	if (typeof (value) != 'number')
		throw (new (Error('cannot write a non-number as a number')));

	if (value < 0)
		throw (new Error('specified a negative value for writing an ' +
		    'unsigned value'));

	if (value > max)
		throw (new Error('value is larger than maximum value for ' +
		    'type'));

	if (Math.floor(value) !== value)
		throw (new Error('value has a fractional component'));

	return (value);
}

/*
 * 8-bit version, classy. We can ignore endianness which is good.
 */
function wuint8(value, endian, buffer, offset)
{
	var val;

	if (value === undefined)
		throw (new Error('missing value'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = prepuint(value, 0xff);
	buffer[offset] = val;
}

/*
 * Pretty much the same as the 8-bit version, just this time we need to worry
 * about endian related issues.
 */
function wgint16(val, endian, buffer, offset)
{
	if (endian == 'big') {
		buffer[offset] = (val & 0xff00) >>> 8;
		buffer[offset+1] = val & 0x00ff;
	} else {
		buffer[offset+1] = (val & 0xff00) >>> 8;
		buffer[offset] = val & 0x00ff;
	}
}

function wuint16(value, endian, buffer, offset)
{
	var val;

	if (value === undefined)
		throw (new Error('missing value'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 1 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = prepuint(value, 0xffff);
	wgint16(val, endian, buffer, offset);
}

/*
 * The 32-bit version is going to have to be a little different unfortunately.
 * We can't quite bitshift to get the largest byte, because that would end up
 * getting us caught by the signed values.
 *
 * And yes, we do want to subtract out the lower part by default. This means
 * that when we do the division, it will be treated as a bit shift and we won't
 * end up generating a floating point value. If we did generate a floating point
 * value we'd have to truncate it intelligently, this saves us that problem and
 * may even be somewhat faster under the hood.
 */
function wgint32(val, endian, buffer, offset)
{
	if (endian == 'big') {
		buffer[offset] = (val - (val & 0x00ffffff)) / Math.pow(2, 24);
		buffer[offset+1] = (val >>> 16) & 0xff;
		buffer[offset+2] = (val >>> 8) & 0xff;
		buffer[offset+3] = val & 0xff;
	} else {
		buffer[offset+3] = (val - (val & 0x00ffffff)) /
		    Math.pow(2, 24);
		buffer[offset+2] = (val >>> 16) & 0xff;
		buffer[offset+1] = (val >>> 8) & 0xff;
		buffer[offset] = val & 0xff;
	}
}

function wuint32(value, endian, buffer, offset)
{
	var val;

	if (value === undefined)
		throw (new Error('missing value'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 3 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = prepuint(value, 0xffffffff);
	wgint32(val, endian, buffer, offset);
}

/*
 * Unlike the other versions, we expect the value to be in the form of two
 * arrays where value[0] << 32 + value[1] would result in the value that we
 * want.
 */
function wgint64(value, endian, buffer, offset)
{
	if (endian == 'big') {
		wgint32(value[0], endian, buffer, offset);
		wgint32(value[1], endian, buffer, offset+4);
	} else {
		wgint32(value[0], endian, buffer, offset+4);
		wgint32(value[1], endian, buffer, offset);
	}
}

function wuint64(value, endian, buffer, offset)
{
	if (value === undefined)
		throw (new Error('missing value'));

	if (!(value instanceof Array))
		throw (new Error('value must be an array'));

	if (value.length != 2)
		throw (new Error('value must be an array of length 2'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 7 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	prepuint(value[0], 0xffffffff);
	prepuint(value[1], 0xffffffff);
	wgint64(value, endian, buffer, offset);
}

/*
 * We now move onto our friends in the signed number category. Unlike unsigned
 * numbers, we're going to have to worry a bit more about how we put values into
 * arrays. Since we are only worrying about signed 32-bit values, we're in
 * slightly better shape. Unfortunately, we really can't do our favorite binary
 * & in this system. It really seems to do the wrong thing. For example:
 *
 * > -32 & 0xff
 * 224
 *
 * What's happening above is really: 0xe0 & 0xff = 0xe0. However, the results of
 * this aren't treated as a signed number. Ultimately a bad thing.
 *
 * What we're going to want to do is basically create the unsigned equivalent of
 * our representation and pass that off to the wuint* functions. To do that
 * we're going to do the following:
 *
 *  - if the value is positive
 *	we can pass it directly off to the equivalent wuint
 *  - if the value is negative
 *	we do the following computation:
 *	mb + val + 1, where
 *	mb	is the maximum unsigned value in that byte size
 *	val	is the Javascript negative integer
 *
 *
 * As a concrete value, take -128. In signed 16 bits this would be 0xff80. If
 * you do out the computations:
 *
 * 0xffff - 128 + 1
 * 0xffff - 127
 * 0xff80
 *
 * You can then encode this value as the signed version. This is really rather
 * hacky, but it should work and get the job done which is our goal here.
 *
 * Thus the overall flow is:
 *   -  Truncate the floating point part of the number
 *   -  We don't have to take the modulus, because the unsigned versions will
 *   	take care of that for us. And we don't have to worry about that
 *   	potentially causing bad things to happen because of sign extension
 *   -  Pass it off to the appropriate unsigned version, potentially modifying
 *	the negative portions as necessary.
 */

/*
 * A series of checks to make sure we actually have a signed 32-bit number
 */
function prepsint(value, max, min)
{
	if (typeof (value) != 'number')
		throw (new (Error('cannot write a non-number as a number')));

	if (value > max)
		throw (new Error('value larger than maximum allowed value'));

	if (value < min)
		throw (new Error('value smaller than minimum allowed value'));

	if (Math.floor(value) !== value)
		throw (new Error('value has a fractional component'));

	return (value);
}

/*
 * The 8-bit version of the signed value. Overall, fairly straightforward.
 */
function wsint8(value, endian, buffer, offset)
{
	var val;

	if (value === undefined)
		throw (new Error('missing value'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = prepsint(value, 0x7f, -0x80);
	if (val >= 0)
		wuint8(val, endian, buffer, offset);
	else
		wuint8(0xff + val + 1, endian, buffer, offset);
}

/*
 * The 16-bit version of the signed value. Also, fairly straightforward.
 */
function wsint16(value, endian, buffer, offset)
{
	var val;

	if (value === undefined)
		throw (new Error('missing value'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 1 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = prepsint(value, 0x7fff, -0x8000);
	if (val >= 0)
		wgint16(val, endian, buffer, offset);
	else
		wgint16(0xffff + val + 1, endian, buffer, offset);

}

/*
 * We can do this relatively easily by leveraging the code used for 32-bit
 * unsigned code.
 */
function wsint32(value, endian, buffer, offset)
{
	var val;

	if (value === undefined)
		throw (new Error('missing value'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 3 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	val = prepsint(value, 0x7fffffff, -0x80000000);
	if (val >= 0)
		wgint32(val, endian, buffer, offset);
	else
		wgint32(0xffffffff + val + 1, endian, buffer, offset);
}

/*
 * The signed 64 bit integer should by in the same format as when received.
 * Mainly it should ensure that the value is an array of two integers where
 * value[0] << 32 + value[1] is the desired number. Furthermore, the two values
 * need to be equal.
 */
function wsint64(value, endian, buffer, offset)
{
	var vzpos, vopos;
	var vals = new Array(2);

	if (value === undefined)
		throw (new Error('missing value'));

	if (!(value instanceof Array))
		throw (new Error('value must be an array'));

	if (value.length != 2)
		throw (new Error('value must be an array of length 2'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));

	if (offset + 7 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	/*
	 * We need to make sure that we have the same sign on both values. The
	 * hokiest way to to do this is to multiply the number by +inf. If we do
	 * this, we'll get either +/-inf depending on the sign of the value.
	 * Once we have this, we can compare it to +inf to see if the number is
	 * positive or not.
	 */
	vzpos = (value[0] * Number.POSITIVE_INFINITY) ==
	    Number.POSITIVE_INFINITY;
	vopos = (value[1] * Number.POSITIVE_INFINITY) ==
	    Number.POSITIVE_INFINITY;

	/*
	 * If either of these is zero, then we don't actually need this check.
	 */
	if (value[0] != 0 && value[1] != 0 && vzpos != vopos)
		throw (new Error('Both entries in the array must have ' +
		    'the same sign'));

	/*
	 * Doing verification for a signed 64-bit integer is actually a big
	 * trickier than it appears. We can't quite use our standard techniques
	 * because we need to compare both sets of values. The first value is
	 * pretty straightforward. If the first value is beond the extremes than
	 * we error out. However, the valid range of the second value varies
	 * based on the first one. If the first value is negative, and *not* the
	 * largest negative value, than it can be any integer within the range [
	 * 0, 0xffffffff ]. If it is the largest negative number, it must be
	 * zero.
	 *
	 * If the first number is positive, than it doesn't matter what the
	 * value is. We just simply have to make sure we have a valid positive
	 * integer.
	 */
	if (vzpos) {
		prepuint(value[0], 0x7fffffff);
		prepuint(value[1], 0xffffffff);
	} else {
		prepsint(value[0], 0, -0x80000000);
		prepsint(value[1], 0, -0xffffffff);
		if (value[0] == -0x80000000 && value[1] != 0)
			throw (new Error('value smaller than minimum ' +
			    'allowed value'));
	}

	/* Fix negative numbers */
	if (value[0] < 0 || value[1] < 0) {
		vals[0] = 0xffffffff - Math.abs(value[0]);
		vals[1] = 0x100000000 - Math.abs(value[1]);
		if (vals[1] == 0x100000000) {
			vals[1] = 0;
			vals[0]++;
		}
	} else {
		vals[0] = value[0];
		vals[1] = value[1];
	}
	wgint64(vals, endian, buffer, offset);
}

/*
 * Now we are moving onto the weirder of these, the float and double. For this
 * we're going to just have to do something that's pretty weird. First off, we
 * have no way to get at the underlying float representation, at least not
 * easily. But that doesn't mean we can't figure it out, we just have to use our
 * heads.
 *
 * One might propose to use Number.toString(2). Of course, this is not really
 * that good, because the ECMAScript 262 v3 Standard says the following Section
 * 15.7.4.2-Number.prototype.toString (radix):
 *
 * If radix is an integer from 2 to 36, but not 10, the result is a string, the
 * choice of which is implementation-dependent.
 *
 * Well that doesn't really help us one bit now does it? We could use the
 * standard base 10 version of the string, but that's just going to create more
 * errors as we end up trying to convert it back to a binary value. So, really
 * this just means we have to be non-lazy and parse the structure intelligently.
 *
 * First off, we can do the basic checks: NaN, positive and negative infinity.
 *
 * Now that those are done we can work backwards to generate the mantissa and
 * exponent.
 *
 * The first thing we need to do is determine the sign bit, easy to do, check
 * whether the value is less than 0. And convert the number to its absolute
 * value representation. Next, we need to determine if the value is less than
 * one or greater than or equal to one and from there determine what power was
 * used to get there. What follows is now specific to floats, though the general
 * ideas behind this will hold for doubles as well, but the exact numbers
 * involved will change.
 *
 * Once we have that power we can determine the exponent and the mantissa. Call
 * the value that has the number of bits to reach the power ebits. In the
 * general case they have the following values:
 *
 *	exponent	127 + ebits
 *	mantissa	value * 2^(23 - ebits) & 0x7fffff
 *
 * In the case where the value of ebits is <= -127 we are now in the case where
 * we no longer have normalized numbers. In this case the values take on the
 * following values:
 *
 * 	exponent	0
 *	mantissa	value * 2^149 & 0x7fffff
 *
 * Once we have the values for the sign, mantissa, and exponent. We reconstruct
 * the four bytes as follows:
 *
 *	byte0		sign bit and seven most significant bits from the exp
 *			sign << 7 | (exponent & 0xfe) >>> 1
 *
 *	byte1		lsb from the exponent and 7 top bits from the mantissa
 *			(exponent & 0x01) << 7 | (mantissa & 0x7f0000) >>> 16
 *
 *	byte2		bits 8-15 (zero indexing) from mantissa
 *			mantissa & 0xff00 >> 8
 *
 *	byte3		bits 0-7 from mantissa
 *			mantissa & 0xff
 *
 * Once we have this we have to assign them into the buffer in proper endian
 * order.
 */

/*
 * Compute the log base 2 of the value. Now, someone who remembers basic
 * properties of logarithms will point out that we could use the change of base
 * formula for logs, and in fact that would be astute, because that's what we'll
 * do for now. It feels cleaner, albeit it may be less efficient than just
 * iterating and dividing by 2. We may want to come back and revisit that some
 * day.
 */
function log2(value)
{
	return (Math.log(value) / Math.log(2));
}

/*
 * Helper to determine the exponent of the number we're looking at.
 */
function intexp(value)
{
	return (Math.floor(log2(value)));
}

/*
 * Helper to determine the exponent of the fractional part of the value.
 */
function fracexp(value)
{
	return (Math.floor(log2(value)));
}

function wfloat(value, endian, buffer, offset)
{
	var sign, exponent, mantissa, ebits;
	var bytes = [];

	if (value === undefined)
		throw (new Error('missing value'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));


	if (offset + 3 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	if (isNaN(value)) {
		sign = 0;
		exponent = 0xff;
		mantissa = 23;
	} else if (value == Number.POSITIVE_INFINITY) {
		sign = 0;
		exponent = 0xff;
		mantissa = 0;
	} else if (value == Number.NEGATIVE_INFINITY) {
		sign = 1;
		exponent = 0xff;
		mantissa = 0;
	} else {
		/* Well we have some work to do */

		/* Thankfully the sign bit is trivial */
		if (value < 0) {
			sign = 1;
			value = Math.abs(value);
		} else {
			sign = 0;
		}

		/* Use the correct function to determine number of bits */
		if (value < 1)
			ebits = fracexp(value);
		else
			ebits = intexp(value);

		/* Time to deal with the issues surrounding normalization */
		if (ebits <= -127) {
			exponent = 0;
			mantissa = (value * Math.pow(2, 149)) & 0x7fffff;
		} else {
			exponent = 127 + ebits;
			mantissa = value * Math.pow(2, 23 - ebits);
			mantissa &= 0x7fffff;
		}
	}

	bytes[0] = sign << 7 | (exponent & 0xfe) >>> 1;
	bytes[1] = (exponent & 0x01) << 7 | (mantissa & 0x7f0000) >>> 16;
	bytes[2] = (mantissa & 0x00ff00) >>> 8;
	bytes[3] = mantissa & 0x0000ff;

	if (endian == 'big') {
		buffer[offset] = bytes[0];
		buffer[offset+1] = bytes[1];
		buffer[offset+2] = bytes[2];
		buffer[offset+3] = bytes[3];
	} else {
		buffer[offset] = bytes[3];
		buffer[offset+1] = bytes[2];
		buffer[offset+2] = bytes[1];
		buffer[offset+3] = bytes[0];
	}
}

/*
 * Now we move onto doubles. Doubles are similar to floats in pretty much all
 * ways except that the processing isn't quite as straightforward because we
 * can't always use shifting, i.e. we have > 32 bit values.
 *
 * We're going to proceed in an identical fashion to floats and utilize the same
 * helper functions. All that really is changing are the specific values that we
 * use to do the calculations. Thus, to review we have to do the following.
 *
 * First get the sign bit and convert the value to its absolute value
 * representation. Next, we determine the number of bits that we used to get to
 * the value, branching whether the value is greater than or less than 1. Once
 * we have that value which we will again call ebits, we have to do the
 * following in the general case:
 *
 *	exponent	1023 + ebits
 *	mantissa	[value * 2^(52 - ebits)] % 2^52
 *
 * In the case where the value of ebits <= -1023 we no longer use normalized
 * numbers, thus like with floats we have to do slightly different processing:
 *
 *	exponent	0
 *	mantissa	[value * 2^1074] % 2^52
 *
 * Once we have determined the sign, exponent and mantissa we can construct the
 * bytes as follows:
 *
 *	byte0		sign bit and seven most significant bits form the exp
 *			sign << 7 | (exponent & 0x7f0) >>> 4
 *
 *	byte1		Remaining 4 bits from the exponent and the four most
 *			significant bits from the mantissa 48-51
 *			(exponent & 0x00f) << 4 | mantissa >>> 48
 *
 *	byte2		Bits 40-47 from the mantissa
 *			(mantissa >>> 40) & 0xff
 *
 *	byte3		Bits 32-39 from the mantissa
 *			(mantissa >>> 32) & 0xff
 *
 *	byte4		Bits 24-31 from the mantissa
 *			(mantissa >>> 24) & 0xff
 *
 *	byte5		Bits 16-23 from the Mantissa
 *			(mantissa >>> 16) & 0xff
 *
 *	byte6		Bits 8-15 from the mantissa
 *			(mantissa >>> 8) & 0xff
 *
 *	byte7		Bits 0-7 from the mantissa
 *			mantissa & 0xff
 *
 * Now we can't quite do the right shifting that we want in bytes 1 - 3, because
 * we'll have extended too far and we'll lose those values when we try and do
 * the shift. Instead we have to use an alternate approach. To try and stay out
 * of floating point, what we'll do is say that mantissa -= bytes[4-7] and then
 * divide by 2^32. Once we've done that we can use binary arithmetic. Oof,
 * that's ugly, but it seems to avoid using floating point (just based on how v8
 * seems to be optimizing for base 2 arithmetic).
 */
function wdouble(value, endian, buffer, offset)
{
	var sign, exponent, mantissa, ebits;
	var bytes = [];

	if (value === undefined)
		throw (new Error('missing value'));

	if (endian === undefined)
		throw (new Error('missing endian'));

	if (buffer === undefined)
		throw (new Error('missing buffer'));

	if (offset === undefined)
		throw (new Error('missing offset'));


	if (offset + 7 >= buffer.length)
		throw (new Error('Trying to read beyond buffer length'));

	if (isNaN(value)) {
		sign = 0;
		exponent = 0x7ff;
		mantissa = 23;
	} else if (value == Number.POSITIVE_INFINITY) {
		sign = 0;
		exponent = 0x7ff;
		mantissa = 0;
	} else if (value == Number.NEGATIVE_INFINITY) {
		sign = 1;
		exponent = 0x7ff;
		mantissa = 0;
	} else {
		/* Well we have some work to do */

		/* Thankfully the sign bit is trivial */
		if (value < 0) {
			sign = 1;
			value = Math.abs(value);
		} else {
			sign = 0;
		}

		/* Use the correct function to determine number of bits */
		if (value < 1)
			ebits = fracexp(value);
		else
			ebits = intexp(value);

		/*
		 * This is a total hack to determine a denormalized value.
		 * Unfortunately, we sometimes do not get a proper value for
		 * ebits, i.e. we lose the values that would get rounded off.
		 *
		 *
		 * The astute observer may wonder why we would be
		 * multiplying by two Math.pows rather than just summing
		 * them. Well, that's to get around a small bug in the
		 * way v8 seems to implement the function. On occasion
		 * doing:
		 *
		 * foo * Math.pow(2, 1023 + 51)
		 *
		 * Causes us to overflow to infinity, where as doing:
		 *
		 * foo * Math.pow(2, 1023) * Math.pow(2, 51)
		 *
		 * Does not cause us to overflow. Go figure.
		 *
		 */
		if (value <= 2.225073858507201e-308 || ebits <= -1023) {
			exponent = 0;
			mantissa = value * Math.pow(2, 1023) * Math.pow(2, 51);
			mantissa %= Math.pow(2, 52);
		} else {
			/*
			 * We might have gotten fucked by our floating point
			 * logarithm magic. This is rather crappy, but that's
			 * our luck. If we just had a log base 2 or access to
			 * the stupid underlying representation this would have
			 * been much easier and we wouldn't have such stupid
			 * kludges or hacks.
			 */
			if (ebits > 1023)
				ebits = 1023;
			exponent = 1023 + ebits;
			mantissa = value * Math.pow(2, -ebits);
			mantissa *= Math.pow(2, 52);
			mantissa %= Math.pow(2, 52);
		}
	}

	/* Fill the bytes in backwards to deal with the size issues */
	bytes[7] = mantissa & 0xff;
	bytes[6] = (mantissa >>> 8) & 0xff;
	bytes[5] = (mantissa >>> 16) & 0xff;
	mantissa = (mantissa - (mantissa & 0xffffff)) / Math.pow(2, 24);
	bytes[4] = mantissa & 0xff;
	bytes[3] = (mantissa >>> 8) & 0xff;
	bytes[2] = (mantissa >>> 16) & 0xff;
	bytes[1] = (exponent & 0x00f) << 4 | mantissa >>> 24;
	bytes[0] = (sign << 7) | (exponent & 0x7f0) >>> 4;

	if (endian == 'big') {
		buffer[offset] = bytes[0];
		buffer[offset+1] = bytes[1];
		buffer[offset+2] = bytes[2];
		buffer[offset+3] = bytes[3];
		buffer[offset+4] = bytes[4];
		buffer[offset+5] = bytes[5];
		buffer[offset+6] = bytes[6];
		buffer[offset+7] = bytes[7];
	} else {
		buffer[offset+7] = bytes[0];
		buffer[offset+6] = bytes[1];
		buffer[offset+5] = bytes[2];
		buffer[offset+4] = bytes[3];
		buffer[offset+3] = bytes[4];
		buffer[offset+2] = bytes[5];
		buffer[offset+1] = bytes[6];
		buffer[offset] = bytes[7];
	}
}

/*
 * Actually export our work above. One might argue that we shouldn't expose
 * these interfaces and just force people to use the higher level abstractions
 * around this work. However, unlike say other libraries we've come across, this
 * interface has several properties: it makes sense, it's simple, and it's
 * useful.
 */
exports.ruint8 = ruint8;
exports.ruint16 = ruint16;
exports.ruint32 = ruint32;
exports.ruint64 = ruint64;
exports.wuint8 = wuint8;
exports.wuint16 = wuint16;
exports.wuint32 = wuint32;
exports.wuint64 = wuint64;

exports.rsint8 = rsint8;
exports.rsint16 = rsint16;
exports.rsint32 = rsint32;
exports.rsint64 = rsint64;
exports.wsint8 = wsint8;
exports.wsint16 = wsint16;
exports.wsint32 = wsint32;
exports.wsint64 = wsint64;

exports.rfloat = rfloat;
exports.rdouble = rdouble;
exports.wfloat = wfloat;
exports.wdouble = wdouble;

},{"assert":undefined}],90:[function(require,module,exports){
/*
 * rm - Feb 2011
 * ctype.js
 *
 * This module provides a simple abstraction towards reading and writing
 * different types of binary data. It is designed to use ctio.js and provide a
 * richer and more expressive API on top of it.
 *
 * By default we support the following as built in basic types:
 *	int8_t
 *	int16_t
 *	int32_t
 *	uint8_t
 *	uint16_t
 *	uint32_t
 *	uint64_t
 *	float
 *	double
 *	char
 *	char[]
 *
 * Each type is returned as a Number, with the exception of char and char[]
 * which are returned as Node Buffers. A char is considered a uint8_t.
 *
 * Requests to read and write data are specified as an array of JSON objects.
 * This is also the same way that one declares structs. Even if just a single
 * value is requested, it must be done as a struct. The array order determines
 * the order that we try and read values. Each entry has the following format
 * with values marked with a * being optional.
 *
 * { key: { type: /type/, value*: /value/, offset*: /offset/ }
 *
 * If offset is defined, we lseek(offset, SEEK_SET) before reading the next
 * value. Value is defined when we're writing out data, otherwise it's ignored.
 *
 */

var mod_ctf = require('./ctf.js');
var mod_ctio = require('./ctio.js');
var mod_assert = require('assert');

/*
 * This is the set of basic types that we support.
 *
 *	read		The function to call to read in a value from a buffer
 *
 *	write		The function to call to write a value to a buffer
 *
 */
var deftypes = {
    'uint8_t':  { read: ctReadUint8, write: ctWriteUint8 },
    'uint16_t': { read: ctReadUint16, write: ctWriteUint16 },
    'uint32_t': { read: ctReadUint32, write: ctWriteUint32 },
    'uint64_t': { read: ctReadUint64, write: ctWriteUint64 },
    'int8_t': { read: ctReadSint8, write: ctWriteSint8 },
    'int16_t': { read: ctReadSint16, write: ctWriteSint16 },
    'int32_t': { read: ctReadSint32, write: ctWriteSint32 },
    'int64_t': { read: ctReadSint64, write: ctWriteSint64 },
    'float': { read: ctReadFloat, write: ctWriteFloat },
    'double': { read: ctReadDouble, write: ctWriteDouble },
    'char': { read: ctReadChar, write: ctWriteChar },
    'char[]': { read: ctReadCharArray, write: ctWriteCharArray }
};

/*
 * The following are wrappers around the CType IO low level API. They encode
 * knowledge about the size and return something in the expected format.
 */
function ctReadUint8(endian, buffer, offset)
{
	var val = mod_ctio.ruint8(buffer, endian, offset);
	return ({ value: val, size: 1 });
}

function ctReadUint16(endian, buffer, offset)
{
	var val = mod_ctio.ruint16(buffer, endian, offset);
	return ({ value: val, size: 2 });
}

function ctReadUint32(endian, buffer, offset)
{
	var val = mod_ctio.ruint32(buffer, endian, offset);
	return ({ value: val, size: 4 });
}

function ctReadUint64(endian, buffer, offset)
{
	var val = mod_ctio.ruint64(buffer, endian, offset);
	return ({ value: val, size: 8 });
}

function ctReadSint8(endian, buffer, offset)
{
	var val = mod_ctio.rsint8(buffer, endian, offset);
	return ({ value: val, size: 1 });
}

function ctReadSint16(endian, buffer, offset)
{
	var val = mod_ctio.rsint16(buffer, endian, offset);
	return ({ value: val, size: 2 });
}

function ctReadSint32(endian, buffer, offset)
{
	var val = mod_ctio.rsint32(buffer, endian, offset);
	return ({ value: val, size: 4 });
}

function ctReadSint64(endian, buffer, offset)
{
	var val = mod_ctio.rsint64(buffer, endian, offset);
	return ({ value: val, size: 8 });
}

function ctReadFloat(endian, buffer, offset)
{
	var val = mod_ctio.rfloat(buffer, endian, offset);
	return ({ value: val, size: 4 });
}

function ctReadDouble(endian, buffer, offset)
{
	var val = mod_ctio.rdouble(buffer, endian, offset);
	return ({ value: val, size: 8 });
}

/*
 * Reads a single character into a node buffer
 */
function ctReadChar(endian, buffer, offset)
{
	var res = new Buffer(1);
	res[0] = mod_ctio.ruint8(buffer, endian, offset);
	return ({ value: res, size: 1 });
}

function ctReadCharArray(length, endian, buffer, offset)
{
	var ii;
	var res = new Buffer(length);

	for (ii = 0; ii < length; ii++)
		res[ii] = mod_ctio.ruint8(buffer, endian, offset + ii);

	return ({ value: res, size: length });
}

function ctWriteUint8(value, endian, buffer, offset)
{
	mod_ctio.wuint8(value, endian, buffer, offset);
	return (1);
}

function ctWriteUint16(value, endian, buffer, offset)
{
	mod_ctio.wuint16(value, endian, buffer, offset);
	return (2);
}

function ctWriteUint32(value, endian, buffer, offset)
{
	mod_ctio.wuint32(value, endian, buffer, offset);
	return (4);
}

function ctWriteUint64(value, endian, buffer, offset)
{
	mod_ctio.wuint64(value, endian, buffer, offset);
	return (8);
}

function ctWriteSint8(value, endian, buffer, offset)
{
	mod_ctio.wsint8(value, endian, buffer, offset);
	return (1);
}

function ctWriteSint16(value, endian, buffer, offset)
{
	mod_ctio.wsint16(value, endian, buffer, offset);
	return (2);
}

function ctWriteSint32(value, endian, buffer, offset)
{
	mod_ctio.wsint32(value, endian, buffer, offset);
	return (4);
}

function ctWriteSint64(value, endian, buffer, offset)
{
	mod_ctio.wsint64(value, endian, buffer, offset);
	return (8);
}

function ctWriteFloat(value, endian, buffer, offset)
{
	mod_ctio.wfloat(value, endian, buffer, offset);
	return (4);
}

function ctWriteDouble(value, endian, buffer, offset)
{
	mod_ctio.wdouble(value, endian, buffer, offset);
	return (8);
}

/*
 * Writes a single character into a node buffer
 */
function ctWriteChar(value, endian, buffer, offset)
{
	if (!(value instanceof Buffer))
		throw (new Error('Input must be a buffer'));

	mod_ctio.ruint8(value[0], endian, buffer, offset);
	return (1);
}

/*
 * We're going to write 0s into the buffer if the string is shorter than the
 * length of the array.
 */
function ctWriteCharArray(value, length, endian, buffer, offset)
{
	var ii;

	if (!(value instanceof Buffer))
		throw (new Error('Input must be a buffer'));

	if (value.length > length)
		throw (new Error('value length greater than array length'));

	for (ii = 0; ii < value.length && ii < length; ii++)
		mod_ctio.wuint8(value[ii], endian, buffer, offset + ii);

	for (; ii < length; ii++)
		mod_ctio.wuint8(0, endian, offset + ii);


	return (length);
}

/*
 * Each parser has their own set of types. We want to make sure that they each
 * get their own copy as they may need to modify it.
 */
function ctGetBasicTypes()
{
	var ret = {};
	var key;
	for (key in deftypes)
		ret[key] = deftypes[key];

	return (ret);
}

/*
 * Given a string in the form of type[length] we want to split this into an
 * object that extracts that information. We want to note that we could possibly
 * have nested arrays so this should only check the furthest one. It may also be
 * the case that we have no [] pieces, in which case we just return the current
 * type.
 */
function ctParseType(str)
{
	var begInd, endInd;
	var type, len;
	if (typeof (str) != 'string')
		throw (new Error('type must be a Javascript string'));

	endInd = str.lastIndexOf(']');
	if (endInd == -1) {
		if (str.lastIndexOf('[') != -1)
			throw (new Error('found invalid type with \'[\' but ' +
			    'no corresponding \']\''));

		return ({ type: str });
	}

	begInd = str.lastIndexOf('[');
	if (begInd == -1)
		throw (new Error('found invalid type with \']\' but ' +
		    'no corresponding \'[\''));

	if (begInd >= endInd)
		throw (new Error('malformed type, \']\' appears before \'[\''));

	type = str.substring(0, begInd);
	len = str.substring(begInd + 1, endInd);

	return ({ type: type, len: len });
}

/*
 * Given a request validate that all of the fields for it are valid and make
 * sense. This includes verifying the following notions:
 *  - Each type requested is present in types
 *  - Only allow a name for a field to be specified once
 *  - If an array is specified, validate that the requested field exists and
 *    comes before it.
 *  - If fields is defined, check that each entry has the occurrence of field
 */
function ctCheckReq(def, types, fields)
{
	var ii, jj;
	var req, keys, key;
	var found = {};

	if (!(def instanceof Array))
		throw (new Error('definition is not an array'));

	if (def.length === 0)
		throw (new Error('definition must have at least one element'));

	for (ii = 0; ii < def.length; ii++) {
		req = def[ii];
		if (!(req instanceof Object))
			throw (new Error('definition must be an array of' +
			    'objects'));

		keys = Object.keys(req);
		if (keys.length != 1)
			throw (new Error('definition entry must only have ' +
			    'one key'));

		if (keys[0] in found)
			throw (new Error('Specified name already ' +
			    'specified: ' + keys[0]));

		if (!('type' in req[keys[0]]))
			throw (new Error('missing required type definition'));

		key = ctParseType(req[keys[0]]['type']);

		/*
		 * We may have nested arrays, we need to check the validity of
		 * the types until the len field is undefined in key. However,
		 * each time len is defined we need to verify it is either an
		 * integer or corresponds to an already seen key.
		 */
		while (key['len'] !== undefined) {
			if (isNaN(parseInt(key['len'], 10))) {
				if (!(key['len'] in found))
					throw (new Error('Given an array ' +
					    'length without a matching type'));

			}

			key = ctParseType(key['type']);
		}

		/* Now we can validate if the type is valid */
		if (!(key['type'] in types))
			throw (new Error('type not found or typdefed: ' +
			    key['type']));

		/* Check for any required fields */
		if (fields !== undefined) {
			for (jj = 0; jj < fields.length; jj++) {
				if (!(fields[jj] in req[keys[0]]))
					throw (new Error('Missing required ' +
					    'field: ' + fields[jj]));
			}
		}

		found[keys[0]] = true;
	}
}


/*
 * Create a new instance of the parser. Each parser has its own store of
 * typedefs and endianness. Conf is an object with the following required
 * values:
 *
 *	endian		Either 'big' or 'little' do determine the endianness we
 *			want to read from or write to.
 *
 * And the following optional values:
 *
 * 	char-type	Valid options here are uint8 and int8. If uint8 is
 * 			specified this changes the default behavior of a single
 * 			char from being a buffer of a single character to being
 * 			a uint8_t. If int8, it becomes an int8_t instead.
 */
function CTypeParser(conf)
{
	if (!conf) throw (new Error('missing required argument'));

	if (!('endian' in conf))
		throw (new Error('missing required endian value'));

	if (conf['endian'] != 'big' && conf['endian'] != 'little')
		throw (new Error('Invalid endian type'));

	if ('char-type' in conf && (conf['char-type'] != 'uint8' &&
	    conf['char-type'] != 'int8'))
		throw (new Error('invalid option for char-type: ' +
		    conf['char-type']));

	this.endian = conf['endian'];
	this.types = ctGetBasicTypes();

	/*
	 * There may be a more graceful way to do this, but this will have to
	 * serve.
	 */
	if ('char-type' in conf && conf['char-type'] == 'uint8')
		this.types['char'] = this.types['uint8_t'];

	if ('char-type' in conf && conf['char-type'] == 'int8')
		this.types['char'] = this.types['int8_t'];
}

/*
 * Sets the current endian value for the Parser. If the value is not valid,
 * throws an Error.
 *
 *	endian		Either 'big' or 'little' do determine the endianness we
 *			want to read from or write to.
 *
 */
CTypeParser.prototype.setEndian = function (endian)
{
	if (endian != 'big' && endian != 'little')
		throw (new Error('invalid endian type, must be big or ' +
		    'little'));

	this.endian = endian;
};

/*
 * Returns the current value of the endian value for the parser.
 */
CTypeParser.prototype.getEndian = function ()
{
	return (this.endian);
};

/*
 * A user has requested to add a type, let us honor their request. Yet, if their
 * request doth spurn us, send them unto the Hells which Dante describes.
 *
 * 	name		The string for the type definition we're adding
 *
 *	value		Either a string that is a type/array name or an object
 *			that describes a struct.
 */
CTypeParser.prototype.typedef = function (name, value)
{
	var type;

	if (name === undefined)
		throw (new (Error('missing required typedef argument: name')));

	if (value === undefined)
		throw (new (Error('missing required typedef argument: value')));

	if (typeof (name) != 'string')
		throw (new (Error('the name of a type must be a string')));

	type = ctParseType(name);

	if (type['len'] !== undefined)
		throw (new Error('Cannot have an array in the typedef name'));

	if (name in this.types)
		throw (new Error('typedef name already present: ' + name));

	if (typeof (value) != 'string' && !(value instanceof Array))
		throw (new Error('typedef value must either be a string or ' +
		    'struct'));

	if (typeof (value) == 'string') {
		type = ctParseType(value);
		if (type['len'] !== undefined) {
			if (isNaN(parseInt(type['len'], 10)))
				throw (new (Error('typedef value must use ' +
				    'fixed size array when outside of a ' +
				    'struct')));
		}

		this.types[name] = value;
	} else {
		/* We have a struct, validate it */
		ctCheckReq(value, this.types);
		this.types[name] = value;
	}
};

/*
 * Include all of the typedefs, but none of the built in types. This should be
 * treated as read-only.
 */
CTypeParser.prototype.lstypes = function ()
{
	var key;
	var ret = {};

	for (key in this.types) {
		if (key in deftypes)
			continue;
		ret[key] = this.types[key];
	}

	return (ret);
};

/*
 * Given a type string that may have array types that aren't numbers, try and
 * fill them in from the values object. The object should be of the format where
 * indexing into it should return a number for that type.
 *
 *	str		The type string
 *
 *	values		An object that can be used to fulfill type information
 */
function ctResolveArray(str, values)
{
	var ret = '';
	var type = ctParseType(str);

	while (type['len'] !== undefined) {
		if (isNaN(parseInt(type['len'], 10))) {
			if (typeof (values[type['len']]) != 'number')
				throw (new Error('cannot sawp in non-number ' +
				    'for array value'));
			ret = '[' + values[type['len']] + ']' + ret;
		} else {
			ret = '[' + type['len'] + ']' + ret;
		}
		type = ctParseType(type['type']);
	}

	ret = type['type'] + ret;

	return (ret);
}

/*
 * [private] Either the typedef resolves to another type string or to a struct.
 * If it resolves to a struct, we just pass it off to read struct. If not, we
 * can just pass it off to read entry.
 */
CTypeParser.prototype.resolveTypedef = function (type, dispatch, buffer,
    offset, value)
{
	var pt;

	mod_assert.ok(type in this.types);
	if (typeof (this.types[type]) == 'string') {
		pt = ctParseType(this.types[type]);
		if (dispatch == 'read')
			return (this.readEntry(pt, buffer, offset));
		else if (dispatch == 'write')
			return (this.writeEntry(value, pt, buffer, offset));
		else
			throw (new Error('invalid dispatch type to ' +
			    'resolveTypedef'));
	} else {
		if (dispatch == 'read')
			return (this.readStruct(this.types[type], buffer,
			    offset));
		else if (dispatch == 'write')
			return (this.writeStruct(value, this.types[type],
			    buffer, offset));
		else
			throw (new Error('invalid dispatch type to ' +
			    'resolveTypedef'));
	}

};

/*
 * [private] Try and read in the specific entry.
 */
CTypeParser.prototype.readEntry = function (type, buffer, offset)
{
	var parse, len;

	/*
	 * Because we want to special case char[]s this is unfortunately
	 * a bit uglier than it really should be. We want to special
	 * case char[]s so that we return a node buffer, thus they are a
	 * first class type where as all other arrays just call into a
	 * generic array routine which calls their data-specific routine
	 * the specified number of times.
	 *
	 * The valid dispatch options we have are:
	 *  - Array and char => char[] handler
	 *  - Generic array handler
	 *  - Generic typedef handler
	 *  - Basic type handler
	 */
	if (type['len'] !== undefined) {
		len = parseInt(type['len'], 10);
		if (isNaN(len))
			throw (new Error('somehow got a non-numeric length'));

		if (type['type'] == 'char')
			parse = this.types['char[]']['read'](len,
			    this.endian, buffer, offset);
		else
			parse = this.readArray(type['type'],
			    len, buffer, offset);
	} else {
		if (type['type'] in deftypes)
			parse = this.types[type['type']]['read'](this.endian,
			    buffer, offset);
		else
			parse = this.resolveTypedef(type['type'], 'read',
			    buffer, offset);
	}

	return (parse);
};

/*
 * [private] Read an array of data
 */
CTypeParser.prototype.readArray = function (type, length, buffer, offset)
{
	var ii, ent, pt;
	var baseOffset = offset;
	var ret = new Array(length);
	pt = ctParseType(type);

	for (ii = 0; ii < length; ii++) {
		ent = this.readEntry(pt, buffer, offset);
		offset += ent['size'];
		ret[ii] = ent['value'];
	}

	return ({ value: ret, size: offset - baseOffset });
};

/*
 * [private] Read a single struct in.
 */
CTypeParser.prototype.readStruct = function (def, buffer, offset)
{
	var parse, ii, type, entry, key;
	var baseOffset = offset;
	var ret = {};

	/* Walk it and handle doing what's necessary */
	for (ii = 0; ii < def.length; ii++) {
		key = Object.keys(def[ii])[0];
		entry = def[ii][key];

		/* Resolve all array values */
		type = ctParseType(ctResolveArray(entry['type'], ret));

		if ('offset' in entry)
			offset = baseOffset + entry['offset'];

		parse = this.readEntry(type, buffer, offset);

		offset += parse['size'];
		ret[key] = parse['value'];
	}

	return ({ value: ret, size: (offset-baseOffset)});
};

/*
 * This is what we were born to do. We read the data from a buffer and return it
 * in an object whose keys match the values from the object.
 *
 *	def		The array definition of the data to read in
 *
 *	buffer		The buffer to read data from
 *
 *	offset		The offset to start writing to
 *
 * Returns an object where each key corresponds to an entry in def and the value
 * is the read value.
 */
CTypeParser.prototype.readData = function (def, buffer, offset)
{
	/* Sanity check for arguments */
	if (def === undefined)
		throw (new Error('missing definition for what we should be' +
		    'parsing'));

	if (buffer === undefined)
		throw (new Error('missing buffer for what we should be ' +
		    'parsing'));

	if (offset === undefined)
		throw (new Error('missing offset for what we should be ' +
		    'parsing'));

	/* Sanity check the object definition */
	ctCheckReq(def, this.types);

	return (this.readStruct(def, buffer, offset)['value']);
};

/*
 * [private] Write out an array of data
 */
CTypeParser.prototype.writeArray = function (value, type, length, buffer,
    offset)
{
	var ii, pt;
	var baseOffset = offset;
	if (!(value instanceof Array))
		throw (new Error('asked to write an array, but value is not ' +
		    'an array'));

	if (value.length != length)
		throw (new Error('asked to write array of length ' + length +
		    ' but that does not match value length: ' + value.length));

	pt = ctParseType(type);
	for (ii = 0; ii < length; ii++)
		offset += this.writeEntry(value[ii], pt, buffer, offset);

	return (offset - baseOffset);
};

/*
 * [private] Write the specific entry
 */
CTypeParser.prototype.writeEntry = function (value, type, buffer, offset)
{
	var len, ret;

	if (type['len'] !== undefined) {
		len = parseInt(type['len'], 10);
		if (isNaN(len))
			throw (new Error('somehow got a non-numeric length'));

		if (type['type'] == 'char')
			ret = this.types['char[]']['write'](value, len,
			    this.endian, buffer, offset);
		else
			ret = this.writeArray(value, type['type'],
			    len, buffer, offset);
	} else {
		if (type['type'] in deftypes)
			ret = this.types[type['type']]['write'](value,
			    this.endian, buffer, offset);
		else
			ret = this.resolveTypedef(type['type'], 'write',
			    buffer, offset, value);
	}

	return (ret);
};

/*
 * [private] Write a single struct out.
 */
CTypeParser.prototype.writeStruct = function (value, def, buffer, offset)
{
	var ii, entry, type, key;
	var baseOffset = offset;
	var vals = {};

	for (ii = 0; ii < def.length; ii++) {
		key = Object.keys(def[ii])[0];
		entry = def[ii][key];

		type = ctParseType(ctResolveArray(entry['type'], vals));

		if ('offset' in entry)
			offset = baseOffset + entry['offset'];

		offset += this.writeEntry(value[ii], type, buffer, offset);
		/* Now that we've written it out, we can use it for arrays */
		vals[key] = value[ii];
	}

	return (offset);
};

/*
 * Unfortunately, we're stuck with the sins of an initial poor design. Because
 * of that, we are going to have to support the old way of writing data via
 * writeData. There we insert the values that you want to write into the
 * definition. A little baroque. Internally, we use the new model. So we need to
 * just get those values out of there. But to maintain the principle of least
 * surprise, we're not going to modify the input data.
 */
function getValues(def)
{
	var ii, out, key;
	out = [];
	for (ii = 0; ii < def.length; ii++) {
		key = Object.keys(def[ii])[0];
		mod_assert.ok('value' in def[ii][key]);
		out.push(def[ii][key]['value']);
	}

	return (out);
}

/*
 * This is the second half of what we were born to do, write out the data
 * itself. Historically this function required you to put your values in the
 * definition section. This was not the smartest thing to do and a bit of an
 * oversight to be honest. As such, this function now takes a values argument.
 * If values is non-null and non-undefined, it will be used to determine the
 * values. This means that the old method is still supported, but is no longer
 * acceptable.
 *
 *	def		The array definition of the data to write out with
 *			values
 *
 *	buffer		The buffer to write to
 *
 *	offset		The offset in the buffer to write to
 *
 *	values		An array of values to write.
 */
CTypeParser.prototype.writeData = function (def, buffer, offset, values)
{
	var hv;

	if (def === undefined)
		throw (new Error('missing definition for what we should be' +
		    'parsing'));

	if (buffer === undefined)
		throw (new Error('missing buffer for what we should be ' +
		    'parsing'));

	if (offset === undefined)
		throw (new Error('missing offset for what we should be ' +
		    'parsing'));

	hv = (values != null && values != undefined);
	if (hv) {
		if (!Array.isArray(values))
			throw (new Error('missing values for writing'));
		ctCheckReq(def, this.types);
	} else {
		ctCheckReq(def, this.types, [ 'value' ]);
	}

	this.writeStruct(hv ? values : getValues(def), def, buffer, offset);
};

/*
 * Functions to go to and from 64 bit numbers in a way that is compatible with
 * Javascript limitations. There are two sets. One where the user is okay with
 * an approximation and one where they are definitely not okay with an
 * approximation.
 */

/*
 * Attempts to convert an array of two integers returned from rsint64 / ruint64
 * into an absolute 64 bit number. If however the value would exceed 2^52 this
 * will instead throw an error. The mantissa in a double is a 52 bit number and
 * rather than potentially give you a value that is an approximation this will
 * error. If you would rather an approximation, please see toApprox64.
 *
 *	val		An array of two 32-bit integers
 */
function toAbs64(val)
{
	if (val === undefined)
		throw (new Error('missing required arg: value'));

	if (!Array.isArray(val))
		throw (new Error('value must be an array'));

	if (val.length != 2)
		throw (new Error('value must be an array of length 2'));

	/* We have 20 bits worth of precision in this range */
	if (val[0] >= 0x100000)
		throw (new Error('value would become approximated'));

	return (val[0] * Math.pow(2, 32) + val[1]);
}

/*
 * Will return the 64 bit value as returned in an array from rsint64 / ruint64
 * to a value as close as it can. Note that Javascript stores all numbers as a
 * double and the mantissa only has 52 bits. Thus this version may approximate
 * the value.
 *
 *	val		An array of two 32-bit integers
 */
function toApprox64(val)
{
	if (val === undefined)
		throw (new Error('missing required arg: value'));

	if (!Array.isArray(val))
		throw (new Error('value must be an array'));

	if (val.length != 2)
		throw (new Error('value must be an array of length 2'));

	return (Math.pow(2, 32) * val[0] + val[1]);
}

function parseCTF(json, conf)
{
	var ctype = new CTypeParser(conf);
	mod_ctf.ctfParseJson(json, ctype);

	return (ctype);
}

/*
 * Export the few things we actually want to. Currently this is just the CType
 * Parser and ctio.
 */
exports.Parser = CTypeParser;
exports.toAbs64 = toAbs64;
exports.toApprox64 = toApprox64;

exports.parseCTF = parseCTF;

exports.ruint8 = mod_ctio.ruint8;
exports.ruint16 = mod_ctio.ruint16;
exports.ruint32 = mod_ctio.ruint32;
exports.ruint64 = mod_ctio.ruint64;
exports.wuint8 = mod_ctio.wuint8;
exports.wuint16 = mod_ctio.wuint16;
exports.wuint32 = mod_ctio.wuint32;
exports.wuint64 = mod_ctio.wuint64;

exports.rsint8 = mod_ctio.rsint8;
exports.rsint16 = mod_ctio.rsint16;
exports.rsint32 = mod_ctio.rsint32;
exports.rsint64 = mod_ctio.rsint64;
exports.wsint8 = mod_ctio.wsint8;
exports.wsint16 = mod_ctio.wsint16;
exports.wsint32 = mod_ctio.wsint32;
exports.wsint64 = mod_ctio.wsint64;

exports.rfloat = mod_ctio.rfloat;
exports.rdouble = mod_ctio.rdouble;
exports.wfloat = mod_ctio.wfloat;
exports.wdouble = mod_ctio.wdouble;

},{"./ctf.js":88,"./ctio.js":89,"assert":undefined}],91:[function(require,module,exports){
var stream = require('stream')


function isStream (obj) {
  return obj instanceof stream.Stream
}


function isReadable (obj) {
  return isStream(obj) && typeof obj._read == 'function' && typeof obj._readableState == 'object'
}


function isWritable (obj) {
  return isStream(obj) && typeof obj._write == 'function' && typeof obj._writableState == 'object'
}


function isDuplex (obj) {
  return isReadable(obj) && isWritable(obj)
}


module.exports            = isStream
module.exports.isReadable = isReadable
module.exports.isWritable = isWritable
module.exports.isDuplex   = isDuplex

},{"stream":undefined}],92:[function(require,module,exports){
exports = module.exports = stringify
exports.getSerialize = serializer

function stringify(obj, replacer, spaces, cycleReplacer) {
  return JSON.stringify(obj, serializer(replacer, cycleReplacer), spaces)
}

function serializer(replacer, cycleReplacer) {
  var stack = [], keys = []

  if (cycleReplacer == null) cycleReplacer = function(key, value) {
    if (stack[0] === value) return "[Circular ~]"
    return "[Circular ~." + keys.slice(0, stack.indexOf(value)).join(".") + "]"
  }

  return function(key, value) {
    if (stack.length > 0) {
      var thisPos = stack.indexOf(this)
      ~thisPos ? stack.splice(thisPos + 1) : stack.push(this)
      ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key)
      if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value)
    }
    else stack.push(value)

    return replacer == null ? value : replacer.call(this, key, value)
  }
}

},{}],93:[function(require,module,exports){
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

var db = require('mime-db')
var extname = require('path').extname

/**
 * Module variables.
 * @private
 */

var extractTypeRegExp = /^\s*([^;\s]*)(?:;|\s|$)/
var textTypeRegExp = /^text\//i

/**
 * Module exports.
 * @public
 */

exports.charset = charset
exports.charsets = { lookup: charset }
exports.contentType = contentType
exports.extension = extension
exports.extensions = Object.create(null)
exports.lookup = lookup
exports.types = Object.create(null)

// Populate the extensions/types maps
populateMaps(exports.extensions, exports.types)

/**
 * Get the default charset for a MIME type.
 *
 * @param {string} type
 * @return {boolean|string}
 */

function charset(type) {
  if (!type || typeof type !== 'string') {
    return false
  }

  // TODO: use media-typer
  var match = extractTypeRegExp.exec(type)
  var mime = match && db[match[1].toLowerCase()]

  if (mime && mime.charset) {
    return mime.charset
  }

  // default text/* to utf-8
  if (match && textTypeRegExp.test(match[1])) {
    return 'UTF-8'
  }

  return false
}

/**
 * Create a full Content-Type header given a MIME type or extension.
 *
 * @param {string} str
 * @return {boolean|string}
 */

function contentType(str) {
  // TODO: should this even be in this module?
  if (!str || typeof str !== 'string') {
    return false
  }

  var mime = str.indexOf('/') === -1
    ? exports.lookup(str)
    : str

  if (!mime) {
    return false
  }

  // TODO: use content-type or other module
  if (mime.indexOf('charset') === -1) {
    var charset = exports.charset(mime)
    if (charset) mime += '; charset=' + charset.toLowerCase()
  }

  return mime
}

/**
 * Get the default extension for a MIME type.
 *
 * @param {string} type
 * @return {boolean|string}
 */

function extension(type) {
  if (!type || typeof type !== 'string') {
    return false
  }

  // TODO: use media-typer
  var match = extractTypeRegExp.exec(type)

  // get extensions
  var exts = match && exports.extensions[match[1].toLowerCase()]

  if (!exts || !exts.length) {
    return false
  }

  return exts[0]
}

/**
 * Lookup the MIME type for a file path/extension.
 *
 * @param {string} path
 * @return {boolean|string}
 */

function lookup(path) {
  if (!path || typeof path !== 'string') {
    return false
  }

  // get the extension ("ext" or ".ext" or full path)
  var extension = extname('x.' + path)
    .toLowerCase()
    .substr(1)

  if (!extension) {
    return false
  }

  return exports.types[extension] || false
}

/**
 * Populate the extensions and types maps.
 * @private
 */

function populateMaps(extensions, types) {
  // source preference (least -> most)
  var preference = ['nginx', 'apache', undefined, 'iana']

  Object.keys(db).forEach(function forEachMimeType(type) {
    var mime = db[type]
    var exts = mime.extensions

    if (!exts || !exts.length) {
      return
    }

    // mime -> extensions
    extensions[type] = exts

    // extension -> mime
    for (var i = 0; i < exts.length; i++) {
      var extension = exts[i]

      if (types[extension]) {
        var from = preference.indexOf(db[types[extension]].source)
        var to = preference.indexOf(mime.source)

        if (types[extension] !== 'application/octet-stream'
          && from > to || (from === to && types[extension].substr(0, 12) === 'application/')) {
          // skip the remapping
          return
        }
      }

      // set the extension -> mime
      types[extension] = type
    }
  })
}

},{"mime-db":95,"path":undefined}],94:[function(require,module,exports){
module.exports={
  "application/1d-interleaved-parityfec": {
    "source": "iana"
  },
  "application/3gpdash-qoe-report+xml": {
    "source": "iana"
  },
  "application/3gpp-ims+xml": {
    "source": "iana"
  },
  "application/a2l": {
    "source": "iana"
  },
  "application/activemessage": {
    "source": "iana"
  },
  "application/alto-costmap+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-costmapfilter+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-directory+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-endpointcost+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-endpointcostparams+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-endpointprop+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-endpointpropparams+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-error+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-networkmap+json": {
    "source": "iana",
    "compressible": true
  },
  "application/alto-networkmapfilter+json": {
    "source": "iana",
    "compressible": true
  },
  "application/aml": {
    "source": "iana"
  },
  "application/andrew-inset": {
    "source": "iana",
    "extensions": ["ez"]
  },
  "application/applefile": {
    "source": "iana"
  },
  "application/applixware": {
    "source": "apache",
    "extensions": ["aw"]
  },
  "application/atf": {
    "source": "iana"
  },
  "application/atfx": {
    "source": "iana"
  },
  "application/atom+xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["atom"]
  },
  "application/atomcat+xml": {
    "source": "iana",
    "extensions": ["atomcat"]
  },
  "application/atomdeleted+xml": {
    "source": "iana"
  },
  "application/atomicmail": {
    "source": "iana"
  },
  "application/atomsvc+xml": {
    "source": "iana",
    "extensions": ["atomsvc"]
  },
  "application/atxml": {
    "source": "iana"
  },
  "application/auth-policy+xml": {
    "source": "iana"
  },
  "application/bacnet-xdd+zip": {
    "source": "iana"
  },
  "application/batch-smtp": {
    "source": "iana"
  },
  "application/bdoc": {
    "compressible": false,
    "extensions": ["bdoc"]
  },
  "application/beep+xml": {
    "source": "iana"
  },
  "application/calendar+json": {
    "source": "iana",
    "compressible": true
  },
  "application/calendar+xml": {
    "source": "iana"
  },
  "application/call-completion": {
    "source": "iana"
  },
  "application/cals-1840": {
    "source": "iana"
  },
  "application/cbor": {
    "source": "iana"
  },
  "application/ccmp+xml": {
    "source": "iana"
  },
  "application/ccxml+xml": {
    "source": "iana",
    "extensions": ["ccxml"]
  },
  "application/cdfx+xml": {
    "source": "iana"
  },
  "application/cdmi-capability": {
    "source": "iana",
    "extensions": ["cdmia"]
  },
  "application/cdmi-container": {
    "source": "iana",
    "extensions": ["cdmic"]
  },
  "application/cdmi-domain": {
    "source": "iana",
    "extensions": ["cdmid"]
  },
  "application/cdmi-object": {
    "source": "iana",
    "extensions": ["cdmio"]
  },
  "application/cdmi-queue": {
    "source": "iana",
    "extensions": ["cdmiq"]
  },
  "application/cea": {
    "source": "iana"
  },
  "application/cea-2018+xml": {
    "source": "iana"
  },
  "application/cellml+xml": {
    "source": "iana"
  },
  "application/cfw": {
    "source": "iana"
  },
  "application/cms": {
    "source": "iana"
  },
  "application/cnrp+xml": {
    "source": "iana"
  },
  "application/coap-group+json": {
    "source": "iana",
    "compressible": true
  },
  "application/commonground": {
    "source": "iana"
  },
  "application/conference-info+xml": {
    "source": "iana"
  },
  "application/cpl+xml": {
    "source": "iana"
  },
  "application/csrattrs": {
    "source": "iana"
  },
  "application/csta+xml": {
    "source": "iana"
  },
  "application/cstadata+xml": {
    "source": "iana"
  },
  "application/cu-seeme": {
    "source": "apache",
    "extensions": ["cu"]
  },
  "application/cybercash": {
    "source": "iana"
  },
  "application/dart": {
    "compressible": true
  },
  "application/dash+xml": {
    "source": "iana",
    "extensions": ["mdp"]
  },
  "application/dashdelta": {
    "source": "iana"
  },
  "application/davmount+xml": {
    "source": "iana",
    "extensions": ["davmount"]
  },
  "application/dca-rft": {
    "source": "iana"
  },
  "application/dcd": {
    "source": "iana"
  },
  "application/dec-dx": {
    "source": "iana"
  },
  "application/dialog-info+xml": {
    "source": "iana"
  },
  "application/dicom": {
    "source": "iana"
  },
  "application/dii": {
    "source": "iana"
  },
  "application/dit": {
    "source": "iana"
  },
  "application/dns": {
    "source": "iana"
  },
  "application/docbook+xml": {
    "source": "apache",
    "extensions": ["dbk"]
  },
  "application/dskpp+xml": {
    "source": "iana"
  },
  "application/dssc+der": {
    "source": "iana",
    "extensions": ["dssc"]
  },
  "application/dssc+xml": {
    "source": "iana",
    "extensions": ["xdssc"]
  },
  "application/dvcs": {
    "source": "iana"
  },
  "application/ecmascript": {
    "source": "iana",
    "compressible": true,
    "extensions": ["ecma"]
  },
  "application/edi-consent": {
    "source": "iana"
  },
  "application/edi-x12": {
    "source": "iana",
    "compressible": false
  },
  "application/edifact": {
    "source": "iana",
    "compressible": false
  },
  "application/emma+xml": {
    "source": "iana",
    "extensions": ["emma"]
  },
  "application/emotionml+xml": {
    "source": "iana"
  },
  "application/encaprtp": {
    "source": "iana"
  },
  "application/epp+xml": {
    "source": "iana"
  },
  "application/epub+zip": {
    "source": "iana",
    "extensions": ["epub"]
  },
  "application/eshop": {
    "source": "iana"
  },
  "application/exi": {
    "source": "iana",
    "extensions": ["exi"]
  },
  "application/fastinfoset": {
    "source": "iana"
  },
  "application/fastsoap": {
    "source": "iana"
  },
  "application/fdt+xml": {
    "source": "iana"
  },
  "application/fits": {
    "source": "iana"
  },
  "application/font-sfnt": {
    "source": "iana"
  },
  "application/font-tdpfr": {
    "source": "iana",
    "extensions": ["pfr"]
  },
  "application/font-woff": {
    "source": "iana",
    "compressible": false,
    "extensions": ["woff"]
  },
  "application/font-woff2": {
    "compressible": false,
    "extensions": ["woff2"]
  },
  "application/framework-attributes+xml": {
    "source": "iana"
  },
  "application/gml+xml": {
    "source": "apache",
    "extensions": ["gml"]
  },
  "application/gpx+xml": {
    "source": "apache",
    "extensions": ["gpx"]
  },
  "application/gxf": {
    "source": "apache",
    "extensions": ["gxf"]
  },
  "application/gzip": {
    "source": "iana",
    "compressible": false
  },
  "application/h224": {
    "source": "iana"
  },
  "application/held+xml": {
    "source": "iana"
  },
  "application/http": {
    "source": "iana"
  },
  "application/hyperstudio": {
    "source": "iana",
    "extensions": ["stk"]
  },
  "application/ibe-key-request+xml": {
    "source": "iana"
  },
  "application/ibe-pkg-reply+xml": {
    "source": "iana"
  },
  "application/ibe-pp-data": {
    "source": "iana"
  },
  "application/iges": {
    "source": "iana"
  },
  "application/im-iscomposing+xml": {
    "source": "iana"
  },
  "application/index": {
    "source": "iana"
  },
  "application/index.cmd": {
    "source": "iana"
  },
  "application/index.obj": {
    "source": "iana"
  },
  "application/index.response": {
    "source": "iana"
  },
  "application/index.vnd": {
    "source": "iana"
  },
  "application/inkml+xml": {
    "source": "iana",
    "extensions": ["ink","inkml"]
  },
  "application/iotp": {
    "source": "iana"
  },
  "application/ipfix": {
    "source": "iana",
    "extensions": ["ipfix"]
  },
  "application/ipp": {
    "source": "iana"
  },
  "application/isup": {
    "source": "iana"
  },
  "application/its+xml": {
    "source": "iana"
  },
  "application/java-archive": {
    "source": "apache",
    "compressible": false,
    "extensions": ["jar","war","ear"]
  },
  "application/java-serialized-object": {
    "source": "apache",
    "compressible": false,
    "extensions": ["ser"]
  },
  "application/java-vm": {
    "source": "apache",
    "compressible": false,
    "extensions": ["class"]
  },
  "application/javascript": {
    "source": "iana",
    "charset": "UTF-8",
    "compressible": true,
    "extensions": ["js"]
  },
  "application/jose": {
    "source": "iana"
  },
  "application/jose+json": {
    "source": "iana",
    "compressible": true
  },
  "application/jrd+json": {
    "source": "iana",
    "compressible": true
  },
  "application/json": {
    "source": "iana",
    "charset": "UTF-8",
    "compressible": true,
    "extensions": ["json","map"]
  },
  "application/json-patch+json": {
    "source": "iana",
    "compressible": true
  },
  "application/json-seq": {
    "source": "iana"
  },
  "application/json5": {
    "extensions": ["json5"]
  },
  "application/jsonml+json": {
    "source": "apache",
    "compressible": true,
    "extensions": ["jsonml"]
  },
  "application/jwk+json": {
    "source": "iana",
    "compressible": true
  },
  "application/jwk-set+json": {
    "source": "iana",
    "compressible": true
  },
  "application/jwt": {
    "source": "iana"
  },
  "application/kpml-request+xml": {
    "source": "iana"
  },
  "application/kpml-response+xml": {
    "source": "iana"
  },
  "application/ld+json": {
    "source": "iana",
    "compressible": true,
    "extensions": ["jsonld"]
  },
  "application/link-format": {
    "source": "iana"
  },
  "application/load-control+xml": {
    "source": "iana"
  },
  "application/lost+xml": {
    "source": "iana",
    "extensions": ["lostxml"]
  },
  "application/lostsync+xml": {
    "source": "iana"
  },
  "application/lxf": {
    "source": "iana"
  },
  "application/mac-binhex40": {
    "source": "iana",
    "extensions": ["hqx"]
  },
  "application/mac-compactpro": {
    "source": "apache",
    "extensions": ["cpt"]
  },
  "application/macwriteii": {
    "source": "iana"
  },
  "application/mads+xml": {
    "source": "iana",
    "extensions": ["mads"]
  },
  "application/manifest+json": {
    "charset": "UTF-8",
    "compressible": true,
    "extensions": ["webmanifest"]
  },
  "application/marc": {
    "source": "iana",
    "extensions": ["mrc"]
  },
  "application/marcxml+xml": {
    "source": "iana",
    "extensions": ["mrcx"]
  },
  "application/mathematica": {
    "source": "iana",
    "extensions": ["ma","nb","mb"]
  },
  "application/mathml+xml": {
    "source": "iana",
    "extensions": ["mathml"]
  },
  "application/mathml-content+xml": {
    "source": "iana"
  },
  "application/mathml-presentation+xml": {
    "source": "iana"
  },
  "application/mbms-associated-procedure-description+xml": {
    "source": "iana"
  },
  "application/mbms-deregister+xml": {
    "source": "iana"
  },
  "application/mbms-envelope+xml": {
    "source": "iana"
  },
  "application/mbms-msk+xml": {
    "source": "iana"
  },
  "application/mbms-msk-response+xml": {
    "source": "iana"
  },
  "application/mbms-protection-description+xml": {
    "source": "iana"
  },
  "application/mbms-reception-report+xml": {
    "source": "iana"
  },
  "application/mbms-register+xml": {
    "source": "iana"
  },
  "application/mbms-register-response+xml": {
    "source": "iana"
  },
  "application/mbms-schedule+xml": {
    "source": "iana"
  },
  "application/mbms-user-service-description+xml": {
    "source": "iana"
  },
  "application/mbox": {
    "source": "iana",
    "extensions": ["mbox"]
  },
  "application/media-policy-dataset+xml": {
    "source": "iana"
  },
  "application/media_control+xml": {
    "source": "iana"
  },
  "application/mediaservercontrol+xml": {
    "source": "iana",
    "extensions": ["mscml"]
  },
  "application/merge-patch+json": {
    "source": "iana",
    "compressible": true
  },
  "application/metalink+xml": {
    "source": "apache",
    "extensions": ["metalink"]
  },
  "application/metalink4+xml": {
    "source": "iana",
    "extensions": ["meta4"]
  },
  "application/mets+xml": {
    "source": "iana",
    "extensions": ["mets"]
  },
  "application/mf4": {
    "source": "iana"
  },
  "application/mikey": {
    "source": "iana"
  },
  "application/mods+xml": {
    "source": "iana",
    "extensions": ["mods"]
  },
  "application/moss-keys": {
    "source": "iana"
  },
  "application/moss-signature": {
    "source": "iana"
  },
  "application/mosskey-data": {
    "source": "iana"
  },
  "application/mosskey-request": {
    "source": "iana"
  },
  "application/mp21": {
    "source": "iana",
    "extensions": ["m21","mp21"]
  },
  "application/mp4": {
    "source": "iana",
    "extensions": ["mp4s","m4p"]
  },
  "application/mpeg4-generic": {
    "source": "iana"
  },
  "application/mpeg4-iod": {
    "source": "iana"
  },
  "application/mpeg4-iod-xmt": {
    "source": "iana"
  },
  "application/mrb-consumer+xml": {
    "source": "iana"
  },
  "application/mrb-publish+xml": {
    "source": "iana"
  },
  "application/msc-ivr+xml": {
    "source": "iana"
  },
  "application/msc-mixer+xml": {
    "source": "iana"
  },
  "application/msword": {
    "source": "iana",
    "compressible": false,
    "extensions": ["doc","dot"]
  },
  "application/mxf": {
    "source": "iana",
    "extensions": ["mxf"]
  },
  "application/nasdata": {
    "source": "iana"
  },
  "application/news-checkgroups": {
    "source": "iana"
  },
  "application/news-groupinfo": {
    "source": "iana"
  },
  "application/news-transmission": {
    "source": "iana"
  },
  "application/nlsml+xml": {
    "source": "iana"
  },
  "application/nss": {
    "source": "iana"
  },
  "application/ocsp-request": {
    "source": "iana"
  },
  "application/ocsp-response": {
    "source": "iana"
  },
  "application/octet-stream": {
    "source": "iana",
    "compressible": false,
    "extensions": ["bin","dms","lrf","mar","so","dist","distz","pkg","bpk","dump","elc","deploy","exe","dll","deb","dmg","iso","img","msi","msp","msm","buffer"]
  },
  "application/oda": {
    "source": "iana",
    "extensions": ["oda"]
  },
  "application/odx": {
    "source": "iana"
  },
  "application/oebps-package+xml": {
    "source": "iana",
    "extensions": ["opf"]
  },
  "application/ogg": {
    "source": "iana",
    "compressible": false,
    "extensions": ["ogx"]
  },
  "application/omdoc+xml": {
    "source": "apache",
    "extensions": ["omdoc"]
  },
  "application/onenote": {
    "source": "apache",
    "extensions": ["onetoc","onetoc2","onetmp","onepkg"]
  },
  "application/oxps": {
    "source": "iana",
    "extensions": ["oxps"]
  },
  "application/p2p-overlay+xml": {
    "source": "iana"
  },
  "application/parityfec": {
    "source": "iana"
  },
  "application/patch-ops-error+xml": {
    "source": "iana",
    "extensions": ["xer"]
  },
  "application/pdf": {
    "source": "iana",
    "compressible": false,
    "extensions": ["pdf"]
  },
  "application/pdx": {
    "source": "iana"
  },
  "application/pgp-encrypted": {
    "source": "iana",
    "compressible": false,
    "extensions": ["pgp"]
  },
  "application/pgp-keys": {
    "source": "iana"
  },
  "application/pgp-signature": {
    "source": "iana",
    "extensions": ["asc","sig"]
  },
  "application/pics-rules": {
    "source": "apache",
    "extensions": ["prf"]
  },
  "application/pidf+xml": {
    "source": "iana"
  },
  "application/pidf-diff+xml": {
    "source": "iana"
  },
  "application/pkcs10": {
    "source": "iana",
    "extensions": ["p10"]
  },
  "application/pkcs7-mime": {
    "source": "iana",
    "extensions": ["p7m","p7c"]
  },
  "application/pkcs7-signature": {
    "source": "iana",
    "extensions": ["p7s"]
  },
  "application/pkcs8": {
    "source": "iana",
    "extensions": ["p8"]
  },
  "application/pkix-attr-cert": {
    "source": "iana",
    "extensions": ["ac"]
  },
  "application/pkix-cert": {
    "source": "iana",
    "extensions": ["cer"]
  },
  "application/pkix-crl": {
    "source": "iana",
    "extensions": ["crl"]
  },
  "application/pkix-pkipath": {
    "source": "iana",
    "extensions": ["pkipath"]
  },
  "application/pkixcmp": {
    "source": "iana",
    "extensions": ["pki"]
  },
  "application/pls+xml": {
    "source": "iana",
    "extensions": ["pls"]
  },
  "application/poc-settings+xml": {
    "source": "iana"
  },
  "application/postscript": {
    "source": "iana",
    "compressible": true,
    "extensions": ["ai","eps","ps"]
  },
  "application/provenance+xml": {
    "source": "iana"
  },
  "application/prs.alvestrand.titrax-sheet": {
    "source": "iana"
  },
  "application/prs.cww": {
    "source": "iana",
    "extensions": ["cww"]
  },
  "application/prs.hpub+zip": {
    "source": "iana"
  },
  "application/prs.nprend": {
    "source": "iana"
  },
  "application/prs.plucker": {
    "source": "iana"
  },
  "application/prs.rdf-xml-crypt": {
    "source": "iana"
  },
  "application/prs.xsf+xml": {
    "source": "iana"
  },
  "application/pskc+xml": {
    "source": "iana",
    "extensions": ["pskcxml"]
  },
  "application/qsig": {
    "source": "iana"
  },
  "application/raptorfec": {
    "source": "iana"
  },
  "application/rdap+json": {
    "source": "iana",
    "compressible": true
  },
  "application/rdf+xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["rdf"]
  },
  "application/reginfo+xml": {
    "source": "iana",
    "extensions": ["rif"]
  },
  "application/relax-ng-compact-syntax": {
    "source": "iana",
    "extensions": ["rnc"]
  },
  "application/remote-printing": {
    "source": "iana"
  },
  "application/reputon+json": {
    "source": "iana",
    "compressible": true
  },
  "application/resource-lists+xml": {
    "source": "iana",
    "extensions": ["rl"]
  },
  "application/resource-lists-diff+xml": {
    "source": "iana",
    "extensions": ["rld"]
  },
  "application/riscos": {
    "source": "iana"
  },
  "application/rlmi+xml": {
    "source": "iana"
  },
  "application/rls-services+xml": {
    "source": "iana",
    "extensions": ["rs"]
  },
  "application/rpki-ghostbusters": {
    "source": "iana",
    "extensions": ["gbr"]
  },
  "application/rpki-manifest": {
    "source": "iana",
    "extensions": ["mft"]
  },
  "application/rpki-roa": {
    "source": "iana",
    "extensions": ["roa"]
  },
  "application/rpki-updown": {
    "source": "iana"
  },
  "application/rsd+xml": {
    "source": "apache",
    "extensions": ["rsd"]
  },
  "application/rss+xml": {
    "source": "apache",
    "compressible": true,
    "extensions": ["rss"]
  },
  "application/rtf": {
    "source": "iana",
    "compressible": true,
    "extensions": ["rtf"]
  },
  "application/rtploopback": {
    "source": "iana"
  },
  "application/rtx": {
    "source": "iana"
  },
  "application/samlassertion+xml": {
    "source": "iana"
  },
  "application/samlmetadata+xml": {
    "source": "iana"
  },
  "application/sbml+xml": {
    "source": "iana",
    "extensions": ["sbml"]
  },
  "application/scaip+xml": {
    "source": "iana"
  },
  "application/scim+json": {
    "source": "iana",
    "compressible": true
  },
  "application/scvp-cv-request": {
    "source": "iana",
    "extensions": ["scq"]
  },
  "application/scvp-cv-response": {
    "source": "iana",
    "extensions": ["scs"]
  },
  "application/scvp-vp-request": {
    "source": "iana",
    "extensions": ["spq"]
  },
  "application/scvp-vp-response": {
    "source": "iana",
    "extensions": ["spp"]
  },
  "application/sdp": {
    "source": "iana",
    "extensions": ["sdp"]
  },
  "application/sep+xml": {
    "source": "iana"
  },
  "application/sep-exi": {
    "source": "iana"
  },
  "application/session-info": {
    "source": "iana"
  },
  "application/set-payment": {
    "source": "iana"
  },
  "application/set-payment-initiation": {
    "source": "iana",
    "extensions": ["setpay"]
  },
  "application/set-registration": {
    "source": "iana"
  },
  "application/set-registration-initiation": {
    "source": "iana",
    "extensions": ["setreg"]
  },
  "application/sgml": {
    "source": "iana"
  },
  "application/sgml-open-catalog": {
    "source": "iana"
  },
  "application/shf+xml": {
    "source": "iana",
    "extensions": ["shf"]
  },
  "application/sieve": {
    "source": "iana"
  },
  "application/simple-filter+xml": {
    "source": "iana"
  },
  "application/simple-message-summary": {
    "source": "iana"
  },
  "application/simplesymbolcontainer": {
    "source": "iana"
  },
  "application/slate": {
    "source": "iana"
  },
  "application/smil": {
    "source": "iana"
  },
  "application/smil+xml": {
    "source": "iana",
    "extensions": ["smi","smil"]
  },
  "application/smpte336m": {
    "source": "iana"
  },
  "application/soap+fastinfoset": {
    "source": "iana"
  },
  "application/soap+xml": {
    "source": "iana",
    "compressible": true
  },
  "application/sparql-query": {
    "source": "iana",
    "extensions": ["rq"]
  },
  "application/sparql-results+xml": {
    "source": "iana",
    "extensions": ["srx"]
  },
  "application/spirits-event+xml": {
    "source": "iana"
  },
  "application/sql": {
    "source": "iana"
  },
  "application/srgs": {
    "source": "iana",
    "extensions": ["gram"]
  },
  "application/srgs+xml": {
    "source": "iana",
    "extensions": ["grxml"]
  },
  "application/sru+xml": {
    "source": "iana",
    "extensions": ["sru"]
  },
  "application/ssdl+xml": {
    "source": "apache",
    "extensions": ["ssdl"]
  },
  "application/ssml+xml": {
    "source": "iana",
    "extensions": ["ssml"]
  },
  "application/tamp-apex-update": {
    "source": "iana"
  },
  "application/tamp-apex-update-confirm": {
    "source": "iana"
  },
  "application/tamp-community-update": {
    "source": "iana"
  },
  "application/tamp-community-update-confirm": {
    "source": "iana"
  },
  "application/tamp-error": {
    "source": "iana"
  },
  "application/tamp-sequence-adjust": {
    "source": "iana"
  },
  "application/tamp-sequence-adjust-confirm": {
    "source": "iana"
  },
  "application/tamp-status-query": {
    "source": "iana"
  },
  "application/tamp-status-response": {
    "source": "iana"
  },
  "application/tamp-update": {
    "source": "iana"
  },
  "application/tamp-update-confirm": {
    "source": "iana"
  },
  "application/tar": {
    "compressible": true
  },
  "application/tei+xml": {
    "source": "iana",
    "extensions": ["tei","teicorpus"]
  },
  "application/thraud+xml": {
    "source": "iana",
    "extensions": ["tfi"]
  },
  "application/timestamp-query": {
    "source": "iana"
  },
  "application/timestamp-reply": {
    "source": "iana"
  },
  "application/timestamped-data": {
    "source": "iana",
    "extensions": ["tsd"]
  },
  "application/ttml+xml": {
    "source": "iana"
  },
  "application/tve-trigger": {
    "source": "iana"
  },
  "application/ulpfec": {
    "source": "iana"
  },
  "application/urc-grpsheet+xml": {
    "source": "iana"
  },
  "application/urc-ressheet+xml": {
    "source": "iana"
  },
  "application/urc-targetdesc+xml": {
    "source": "iana"
  },
  "application/urc-uisocketdesc+xml": {
    "source": "iana"
  },
  "application/vcard+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vcard+xml": {
    "source": "iana"
  },
  "application/vemmi": {
    "source": "iana"
  },
  "application/vividence.scriptfile": {
    "source": "apache"
  },
  "application/vnd.3gpp.bsf+xml": {
    "source": "iana"
  },
  "application/vnd.3gpp.pic-bw-large": {
    "source": "iana",
    "extensions": ["plb"]
  },
  "application/vnd.3gpp.pic-bw-small": {
    "source": "iana",
    "extensions": ["psb"]
  },
  "application/vnd.3gpp.pic-bw-var": {
    "source": "iana",
    "extensions": ["pvb"]
  },
  "application/vnd.3gpp.sms": {
    "source": "iana"
  },
  "application/vnd.3gpp.ussd+xml": {
    "source": "iana"
  },
  "application/vnd.3gpp2.bcmcsinfo+xml": {
    "source": "iana"
  },
  "application/vnd.3gpp2.sms": {
    "source": "iana"
  },
  "application/vnd.3gpp2.tcap": {
    "source": "iana",
    "extensions": ["tcap"]
  },
  "application/vnd.3m.post-it-notes": {
    "source": "iana",
    "extensions": ["pwn"]
  },
  "application/vnd.accpac.simply.aso": {
    "source": "iana",
    "extensions": ["aso"]
  },
  "application/vnd.accpac.simply.imp": {
    "source": "iana",
    "extensions": ["imp"]
  },
  "application/vnd.acucobol": {
    "source": "iana",
    "extensions": ["acu"]
  },
  "application/vnd.acucorp": {
    "source": "iana",
    "extensions": ["atc","acutc"]
  },
  "application/vnd.adobe.air-application-installer-package+zip": {
    "source": "apache",
    "extensions": ["air"]
  },
  "application/vnd.adobe.flash.movie": {
    "source": "iana"
  },
  "application/vnd.adobe.formscentral.fcdt": {
    "source": "iana",
    "extensions": ["fcdt"]
  },
  "application/vnd.adobe.fxp": {
    "source": "iana",
    "extensions": ["fxp","fxpl"]
  },
  "application/vnd.adobe.partial-upload": {
    "source": "iana"
  },
  "application/vnd.adobe.xdp+xml": {
    "source": "iana",
    "extensions": ["xdp"]
  },
  "application/vnd.adobe.xfdf": {
    "source": "iana",
    "extensions": ["xfdf"]
  },
  "application/vnd.aether.imp": {
    "source": "iana"
  },
  "application/vnd.ah-barcode": {
    "source": "iana"
  },
  "application/vnd.ahead.space": {
    "source": "iana",
    "extensions": ["ahead"]
  },
  "application/vnd.airzip.filesecure.azf": {
    "source": "iana",
    "extensions": ["azf"]
  },
  "application/vnd.airzip.filesecure.azs": {
    "source": "iana",
    "extensions": ["azs"]
  },
  "application/vnd.amazon.ebook": {
    "source": "apache",
    "extensions": ["azw"]
  },
  "application/vnd.americandynamics.acc": {
    "source": "iana",
    "extensions": ["acc"]
  },
  "application/vnd.amiga.ami": {
    "source": "iana",
    "extensions": ["ami"]
  },
  "application/vnd.amundsen.maze+xml": {
    "source": "iana"
  },
  "application/vnd.android.package-archive": {
    "source": "apache",
    "compressible": false,
    "extensions": ["apk"]
  },
  "application/vnd.anser-web-certificate-issue-initiation": {
    "source": "iana",
    "extensions": ["cii"]
  },
  "application/vnd.anser-web-funds-transfer-initiation": {
    "source": "apache",
    "extensions": ["fti"]
  },
  "application/vnd.antix.game-component": {
    "source": "iana",
    "extensions": ["atx"]
  },
  "application/vnd.apache.thrift.binary": {
    "source": "iana"
  },
  "application/vnd.apache.thrift.compact": {
    "source": "iana"
  },
  "application/vnd.apache.thrift.json": {
    "source": "iana"
  },
  "application/vnd.api+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.apple.installer+xml": {
    "source": "iana",
    "extensions": ["mpkg"]
  },
  "application/vnd.apple.mpegurl": {
    "source": "iana",
    "extensions": ["m3u8"]
  },
  "application/vnd.arastra.swi": {
    "source": "iana"
  },
  "application/vnd.aristanetworks.swi": {
    "source": "iana",
    "extensions": ["swi"]
  },
  "application/vnd.artsquare": {
    "source": "iana"
  },
  "application/vnd.astraea-software.iota": {
    "source": "iana",
    "extensions": ["iota"]
  },
  "application/vnd.audiograph": {
    "source": "iana",
    "extensions": ["aep"]
  },
  "application/vnd.autopackage": {
    "source": "iana"
  },
  "application/vnd.avistar+xml": {
    "source": "iana"
  },
  "application/vnd.balsamiq.bmml+xml": {
    "source": "iana"
  },
  "application/vnd.balsamiq.bmpr": {
    "source": "iana"
  },
  "application/vnd.bekitzur-stech+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.biopax.rdf+xml": {
    "source": "iana"
  },
  "application/vnd.blueice.multipass": {
    "source": "iana",
    "extensions": ["mpm"]
  },
  "application/vnd.bluetooth.ep.oob": {
    "source": "iana"
  },
  "application/vnd.bluetooth.le.oob": {
    "source": "iana"
  },
  "application/vnd.bmi": {
    "source": "iana",
    "extensions": ["bmi"]
  },
  "application/vnd.businessobjects": {
    "source": "iana",
    "extensions": ["rep"]
  },
  "application/vnd.cab-jscript": {
    "source": "iana"
  },
  "application/vnd.canon-cpdl": {
    "source": "iana"
  },
  "application/vnd.canon-lips": {
    "source": "iana"
  },
  "application/vnd.cendio.thinlinc.clientconf": {
    "source": "iana"
  },
  "application/vnd.century-systems.tcp_stream": {
    "source": "iana"
  },
  "application/vnd.chemdraw+xml": {
    "source": "iana",
    "extensions": ["cdxml"]
  },
  "application/vnd.chipnuts.karaoke-mmd": {
    "source": "iana",
    "extensions": ["mmd"]
  },
  "application/vnd.cinderella": {
    "source": "iana",
    "extensions": ["cdy"]
  },
  "application/vnd.cirpack.isdn-ext": {
    "source": "iana"
  },
  "application/vnd.citationstyles.style+xml": {
    "source": "iana"
  },
  "application/vnd.claymore": {
    "source": "iana",
    "extensions": ["cla"]
  },
  "application/vnd.cloanto.rp9": {
    "source": "iana",
    "extensions": ["rp9"]
  },
  "application/vnd.clonk.c4group": {
    "source": "iana",
    "extensions": ["c4g","c4d","c4f","c4p","c4u"]
  },
  "application/vnd.cluetrust.cartomobile-config": {
    "source": "iana",
    "extensions": ["c11amc"]
  },
  "application/vnd.cluetrust.cartomobile-config-pkg": {
    "source": "iana",
    "extensions": ["c11amz"]
  },
  "application/vnd.coffeescript": {
    "source": "iana"
  },
  "application/vnd.collection+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.collection.doc+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.collection.next+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.commerce-battelle": {
    "source": "iana"
  },
  "application/vnd.commonspace": {
    "source": "iana",
    "extensions": ["csp"]
  },
  "application/vnd.contact.cmsg": {
    "source": "iana",
    "extensions": ["cdbcmsg"]
  },
  "application/vnd.cosmocaller": {
    "source": "iana",
    "extensions": ["cmc"]
  },
  "application/vnd.crick.clicker": {
    "source": "iana",
    "extensions": ["clkx"]
  },
  "application/vnd.crick.clicker.keyboard": {
    "source": "iana",
    "extensions": ["clkk"]
  },
  "application/vnd.crick.clicker.palette": {
    "source": "iana",
    "extensions": ["clkp"]
  },
  "application/vnd.crick.clicker.template": {
    "source": "iana",
    "extensions": ["clkt"]
  },
  "application/vnd.crick.clicker.wordbank": {
    "source": "iana",
    "extensions": ["clkw"]
  },
  "application/vnd.criticaltools.wbs+xml": {
    "source": "iana",
    "extensions": ["wbs"]
  },
  "application/vnd.ctc-posml": {
    "source": "iana",
    "extensions": ["pml"]
  },
  "application/vnd.ctct.ws+xml": {
    "source": "iana"
  },
  "application/vnd.cups-pdf": {
    "source": "iana"
  },
  "application/vnd.cups-postscript": {
    "source": "iana"
  },
  "application/vnd.cups-ppd": {
    "source": "iana",
    "extensions": ["ppd"]
  },
  "application/vnd.cups-raster": {
    "source": "iana"
  },
  "application/vnd.cups-raw": {
    "source": "iana"
  },
  "application/vnd.curl": {
    "source": "iana"
  },
  "application/vnd.curl.car": {
    "source": "apache",
    "extensions": ["car"]
  },
  "application/vnd.curl.pcurl": {
    "source": "apache",
    "extensions": ["pcurl"]
  },
  "application/vnd.cyan.dean.root+xml": {
    "source": "iana"
  },
  "application/vnd.cybank": {
    "source": "iana"
  },
  "application/vnd.dart": {
    "source": "iana",
    "compressible": true,
    "extensions": ["dart"]
  },
  "application/vnd.data-vision.rdz": {
    "source": "iana",
    "extensions": ["rdz"]
  },
  "application/vnd.debian.binary-package": {
    "source": "iana"
  },
  "application/vnd.dece.data": {
    "source": "iana",
    "extensions": ["uvf","uvvf","uvd","uvvd"]
  },
  "application/vnd.dece.ttml+xml": {
    "source": "iana",
    "extensions": ["uvt","uvvt"]
  },
  "application/vnd.dece.unspecified": {
    "source": "iana",
    "extensions": ["uvx","uvvx"]
  },
  "application/vnd.dece.zip": {
    "source": "iana",
    "extensions": ["uvz","uvvz"]
  },
  "application/vnd.denovo.fcselayout-link": {
    "source": "iana",
    "extensions": ["fe_launch"]
  },
  "application/vnd.desmume-movie": {
    "source": "iana"
  },
  "application/vnd.dir-bi.plate-dl-nosuffix": {
    "source": "iana"
  },
  "application/vnd.dm.delegation+xml": {
    "source": "iana"
  },
  "application/vnd.dna": {
    "source": "iana",
    "extensions": ["dna"]
  },
  "application/vnd.document+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.dolby.mlp": {
    "source": "apache",
    "extensions": ["mlp"]
  },
  "application/vnd.dolby.mobile.1": {
    "source": "iana"
  },
  "application/vnd.dolby.mobile.2": {
    "source": "iana"
  },
  "application/vnd.doremir.scorecloud-binary-document": {
    "source": "iana"
  },
  "application/vnd.dpgraph": {
    "source": "iana",
    "extensions": ["dpg"]
  },
  "application/vnd.dreamfactory": {
    "source": "iana",
    "extensions": ["dfac"]
  },
  "application/vnd.ds-keypoint": {
    "source": "apache",
    "extensions": ["kpxx"]
  },
  "application/vnd.dtg.local": {
    "source": "iana"
  },
  "application/vnd.dtg.local.flash": {
    "source": "iana"
  },
  "application/vnd.dtg.local.html": {
    "source": "iana"
  },
  "application/vnd.dvb.ait": {
    "source": "iana",
    "extensions": ["ait"]
  },
  "application/vnd.dvb.dvbj": {
    "source": "iana"
  },
  "application/vnd.dvb.esgcontainer": {
    "source": "iana"
  },
  "application/vnd.dvb.ipdcdftnotifaccess": {
    "source": "iana"
  },
  "application/vnd.dvb.ipdcesgaccess": {
    "source": "iana"
  },
  "application/vnd.dvb.ipdcesgaccess2": {
    "source": "iana"
  },
  "application/vnd.dvb.ipdcesgpdd": {
    "source": "iana"
  },
  "application/vnd.dvb.ipdcroaming": {
    "source": "iana"
  },
  "application/vnd.dvb.iptv.alfec-base": {
    "source": "iana"
  },
  "application/vnd.dvb.iptv.alfec-enhancement": {
    "source": "iana"
  },
  "application/vnd.dvb.notif-aggregate-root+xml": {
    "source": "iana"
  },
  "application/vnd.dvb.notif-container+xml": {
    "source": "iana"
  },
  "application/vnd.dvb.notif-generic+xml": {
    "source": "iana"
  },
  "application/vnd.dvb.notif-ia-msglist+xml": {
    "source": "iana"
  },
  "application/vnd.dvb.notif-ia-registration-request+xml": {
    "source": "iana"
  },
  "application/vnd.dvb.notif-ia-registration-response+xml": {
    "source": "iana"
  },
  "application/vnd.dvb.notif-init+xml": {
    "source": "iana"
  },
  "application/vnd.dvb.pfr": {
    "source": "iana"
  },
  "application/vnd.dvb.service": {
    "source": "iana",
    "extensions": ["svc"]
  },
  "application/vnd.dxr": {
    "source": "iana"
  },
  "application/vnd.dynageo": {
    "source": "iana",
    "extensions": ["geo"]
  },
  "application/vnd.dzr": {
    "source": "iana"
  },
  "application/vnd.easykaraoke.cdgdownload": {
    "source": "iana"
  },
  "application/vnd.ecdis-update": {
    "source": "iana"
  },
  "application/vnd.ecowin.chart": {
    "source": "iana",
    "extensions": ["mag"]
  },
  "application/vnd.ecowin.filerequest": {
    "source": "iana"
  },
  "application/vnd.ecowin.fileupdate": {
    "source": "iana"
  },
  "application/vnd.ecowin.series": {
    "source": "iana"
  },
  "application/vnd.ecowin.seriesrequest": {
    "source": "iana"
  },
  "application/vnd.ecowin.seriesupdate": {
    "source": "iana"
  },
  "application/vnd.emclient.accessrequest+xml": {
    "source": "iana"
  },
  "application/vnd.enliven": {
    "source": "iana",
    "extensions": ["nml"]
  },
  "application/vnd.enphase.envoy": {
    "source": "iana"
  },
  "application/vnd.eprints.data+xml": {
    "source": "iana"
  },
  "application/vnd.epson.esf": {
    "source": "iana",
    "extensions": ["esf"]
  },
  "application/vnd.epson.msf": {
    "source": "iana",
    "extensions": ["msf"]
  },
  "application/vnd.epson.quickanime": {
    "source": "iana",
    "extensions": ["qam"]
  },
  "application/vnd.epson.salt": {
    "source": "iana",
    "extensions": ["slt"]
  },
  "application/vnd.epson.ssf": {
    "source": "iana",
    "extensions": ["ssf"]
  },
  "application/vnd.ericsson.quickcall": {
    "source": "iana"
  },
  "application/vnd.eszigno3+xml": {
    "source": "iana",
    "extensions": ["es3","et3"]
  },
  "application/vnd.etsi.aoc+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.asic-e+zip": {
    "source": "iana"
  },
  "application/vnd.etsi.asic-s+zip": {
    "source": "iana"
  },
  "application/vnd.etsi.cug+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvcommand+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvdiscovery+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvprofile+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvsad-bc+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvsad-cod+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvsad-npvr+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvservice+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvsync+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.iptvueprofile+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.mcid+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.mheg5": {
    "source": "iana"
  },
  "application/vnd.etsi.overload-control-policy-dataset+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.pstn+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.sci+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.simservs+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.timestamp-token": {
    "source": "iana"
  },
  "application/vnd.etsi.tsl+xml": {
    "source": "iana"
  },
  "application/vnd.etsi.tsl.der": {
    "source": "iana"
  },
  "application/vnd.eudora.data": {
    "source": "iana"
  },
  "application/vnd.ezpix-album": {
    "source": "iana",
    "extensions": ["ez2"]
  },
  "application/vnd.ezpix-package": {
    "source": "iana",
    "extensions": ["ez3"]
  },
  "application/vnd.f-secure.mobile": {
    "source": "iana"
  },
  "application/vnd.fastcopy-disk-image": {
    "source": "iana"
  },
  "application/vnd.fdf": {
    "source": "iana",
    "extensions": ["fdf"]
  },
  "application/vnd.fdsn.mseed": {
    "source": "iana",
    "extensions": ["mseed"]
  },
  "application/vnd.fdsn.seed": {
    "source": "iana",
    "extensions": ["seed","dataless"]
  },
  "application/vnd.ffsns": {
    "source": "iana"
  },
  "application/vnd.fints": {
    "source": "iana"
  },
  "application/vnd.flographit": {
    "source": "iana",
    "extensions": ["gph"]
  },
  "application/vnd.fluxtime.clip": {
    "source": "iana",
    "extensions": ["ftc"]
  },
  "application/vnd.font-fontforge-sfd": {
    "source": "iana"
  },
  "application/vnd.framemaker": {
    "source": "iana",
    "extensions": ["fm","frame","maker","book"]
  },
  "application/vnd.frogans.fnc": {
    "source": "iana",
    "extensions": ["fnc"]
  },
  "application/vnd.frogans.ltf": {
    "source": "iana",
    "extensions": ["ltf"]
  },
  "application/vnd.fsc.weblaunch": {
    "source": "iana",
    "extensions": ["fsc"]
  },
  "application/vnd.fujitsu.oasys": {
    "source": "iana",
    "extensions": ["oas"]
  },
  "application/vnd.fujitsu.oasys2": {
    "source": "iana",
    "extensions": ["oa2"]
  },
  "application/vnd.fujitsu.oasys3": {
    "source": "iana",
    "extensions": ["oa3"]
  },
  "application/vnd.fujitsu.oasysgp": {
    "source": "iana",
    "extensions": ["fg5"]
  },
  "application/vnd.fujitsu.oasysprs": {
    "source": "iana",
    "extensions": ["bh2"]
  },
  "application/vnd.fujixerox.art-ex": {
    "source": "iana"
  },
  "application/vnd.fujixerox.art4": {
    "source": "iana"
  },
  "application/vnd.fujixerox.ddd": {
    "source": "iana",
    "extensions": ["ddd"]
  },
  "application/vnd.fujixerox.docuworks": {
    "source": "iana",
    "extensions": ["xdw"]
  },
  "application/vnd.fujixerox.docuworks.binder": {
    "source": "iana",
    "extensions": ["xbd"]
  },
  "application/vnd.fujixerox.docuworks.container": {
    "source": "iana"
  },
  "application/vnd.fujixerox.hbpl": {
    "source": "iana"
  },
  "application/vnd.fut-misnet": {
    "source": "iana"
  },
  "application/vnd.fuzzysheet": {
    "source": "iana",
    "extensions": ["fzs"]
  },
  "application/vnd.genomatix.tuxedo": {
    "source": "iana",
    "extensions": ["txd"]
  },
  "application/vnd.geo+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.geocube+xml": {
    "source": "iana"
  },
  "application/vnd.geogebra.file": {
    "source": "iana",
    "extensions": ["ggb"]
  },
  "application/vnd.geogebra.tool": {
    "source": "iana",
    "extensions": ["ggt"]
  },
  "application/vnd.geometry-explorer": {
    "source": "iana",
    "extensions": ["gex","gre"]
  },
  "application/vnd.geonext": {
    "source": "iana",
    "extensions": ["gxt"]
  },
  "application/vnd.geoplan": {
    "source": "iana",
    "extensions": ["g2w"]
  },
  "application/vnd.geospace": {
    "source": "iana",
    "extensions": ["g3w"]
  },
  "application/vnd.gerber": {
    "source": "iana"
  },
  "application/vnd.globalplatform.card-content-mgt": {
    "source": "iana"
  },
  "application/vnd.globalplatform.card-content-mgt-response": {
    "source": "iana"
  },
  "application/vnd.gmx": {
    "source": "iana",
    "extensions": ["gmx"]
  },
  "application/vnd.google-earth.kml+xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["kml"]
  },
  "application/vnd.google-earth.kmz": {
    "source": "iana",
    "compressible": false,
    "extensions": ["kmz"]
  },
  "application/vnd.gov.sk.e-form+xml": {
    "source": "iana"
  },
  "application/vnd.gov.sk.e-form+zip": {
    "source": "iana"
  },
  "application/vnd.gov.sk.xmldatacontainer+xml": {
    "source": "iana"
  },
  "application/vnd.grafeq": {
    "source": "iana",
    "extensions": ["gqf","gqs"]
  },
  "application/vnd.gridmp": {
    "source": "iana"
  },
  "application/vnd.groove-account": {
    "source": "iana",
    "extensions": ["gac"]
  },
  "application/vnd.groove-help": {
    "source": "iana",
    "extensions": ["ghf"]
  },
  "application/vnd.groove-identity-message": {
    "source": "iana",
    "extensions": ["gim"]
  },
  "application/vnd.groove-injector": {
    "source": "iana",
    "extensions": ["grv"]
  },
  "application/vnd.groove-tool-message": {
    "source": "iana",
    "extensions": ["gtm"]
  },
  "application/vnd.groove-tool-template": {
    "source": "iana",
    "extensions": ["tpl"]
  },
  "application/vnd.groove-vcard": {
    "source": "iana",
    "extensions": ["vcg"]
  },
  "application/vnd.hal+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.hal+xml": {
    "source": "iana",
    "extensions": ["hal"]
  },
  "application/vnd.handheld-entertainment+xml": {
    "source": "iana",
    "extensions": ["zmm"]
  },
  "application/vnd.hbci": {
    "source": "iana",
    "extensions": ["hbci"]
  },
  "application/vnd.hcl-bireports": {
    "source": "iana"
  },
  "application/vnd.heroku+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.hhe.lesson-player": {
    "source": "iana",
    "extensions": ["les"]
  },
  "application/vnd.hp-hpgl": {
    "source": "iana",
    "extensions": ["hpgl"]
  },
  "application/vnd.hp-hpid": {
    "source": "iana",
    "extensions": ["hpid"]
  },
  "application/vnd.hp-hps": {
    "source": "iana",
    "extensions": ["hps"]
  },
  "application/vnd.hp-jlyt": {
    "source": "iana",
    "extensions": ["jlt"]
  },
  "application/vnd.hp-pcl": {
    "source": "iana",
    "extensions": ["pcl"]
  },
  "application/vnd.hp-pclxl": {
    "source": "iana",
    "extensions": ["pclxl"]
  },
  "application/vnd.httphone": {
    "source": "iana"
  },
  "application/vnd.hydrostatix.sof-data": {
    "source": "iana",
    "extensions": ["sfd-hdstx"]
  },
  "application/vnd.hyperdrive+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.hzn-3d-crossword": {
    "source": "iana"
  },
  "application/vnd.ibm.afplinedata": {
    "source": "iana"
  },
  "application/vnd.ibm.electronic-media": {
    "source": "iana"
  },
  "application/vnd.ibm.minipay": {
    "source": "iana",
    "extensions": ["mpy"]
  },
  "application/vnd.ibm.modcap": {
    "source": "iana",
    "extensions": ["afp","listafp","list3820"]
  },
  "application/vnd.ibm.rights-management": {
    "source": "iana",
    "extensions": ["irm"]
  },
  "application/vnd.ibm.secure-container": {
    "source": "iana",
    "extensions": ["sc"]
  },
  "application/vnd.iccprofile": {
    "source": "iana",
    "extensions": ["icc","icm"]
  },
  "application/vnd.ieee.1905": {
    "source": "iana"
  },
  "application/vnd.igloader": {
    "source": "iana",
    "extensions": ["igl"]
  },
  "application/vnd.immervision-ivp": {
    "source": "iana",
    "extensions": ["ivp"]
  },
  "application/vnd.immervision-ivu": {
    "source": "iana",
    "extensions": ["ivu"]
  },
  "application/vnd.ims.imsccv1p1": {
    "source": "iana"
  },
  "application/vnd.ims.imsccv1p2": {
    "source": "iana"
  },
  "application/vnd.ims.imsccv1p3": {
    "source": "iana"
  },
  "application/vnd.ims.lis.v2.result+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.ims.lti.v2.toolconsumerprofile+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.ims.lti.v2.toolproxy+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.ims.lti.v2.toolproxy.id+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.ims.lti.v2.toolsettings+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.ims.lti.v2.toolsettings.simple+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.informedcontrol.rms+xml": {
    "source": "iana"
  },
  "application/vnd.informix-visionary": {
    "source": "iana"
  },
  "application/vnd.infotech.project": {
    "source": "iana"
  },
  "application/vnd.infotech.project+xml": {
    "source": "iana"
  },
  "application/vnd.innopath.wamp.notification": {
    "source": "iana"
  },
  "application/vnd.insors.igm": {
    "source": "iana",
    "extensions": ["igm"]
  },
  "application/vnd.intercon.formnet": {
    "source": "iana",
    "extensions": ["xpw","xpx"]
  },
  "application/vnd.intergeo": {
    "source": "iana",
    "extensions": ["i2g"]
  },
  "application/vnd.intertrust.digibox": {
    "source": "iana"
  },
  "application/vnd.intertrust.nncp": {
    "source": "iana"
  },
  "application/vnd.intu.qbo": {
    "source": "iana",
    "extensions": ["qbo"]
  },
  "application/vnd.intu.qfx": {
    "source": "iana",
    "extensions": ["qfx"]
  },
  "application/vnd.iptc.g2.catalogitem+xml": {
    "source": "iana"
  },
  "application/vnd.iptc.g2.conceptitem+xml": {
    "source": "iana"
  },
  "application/vnd.iptc.g2.knowledgeitem+xml": {
    "source": "iana"
  },
  "application/vnd.iptc.g2.newsitem+xml": {
    "source": "iana"
  },
  "application/vnd.iptc.g2.newsmessage+xml": {
    "source": "iana"
  },
  "application/vnd.iptc.g2.packageitem+xml": {
    "source": "iana"
  },
  "application/vnd.iptc.g2.planningitem+xml": {
    "source": "iana"
  },
  "application/vnd.ipunplugged.rcprofile": {
    "source": "iana",
    "extensions": ["rcprofile"]
  },
  "application/vnd.irepository.package+xml": {
    "source": "iana",
    "extensions": ["irp"]
  },
  "application/vnd.is-xpr": {
    "source": "iana",
    "extensions": ["xpr"]
  },
  "application/vnd.isac.fcs": {
    "source": "iana",
    "extensions": ["fcs"]
  },
  "application/vnd.jam": {
    "source": "iana",
    "extensions": ["jam"]
  },
  "application/vnd.japannet-directory-service": {
    "source": "iana"
  },
  "application/vnd.japannet-jpnstore-wakeup": {
    "source": "iana"
  },
  "application/vnd.japannet-payment-wakeup": {
    "source": "iana"
  },
  "application/vnd.japannet-registration": {
    "source": "iana"
  },
  "application/vnd.japannet-registration-wakeup": {
    "source": "iana"
  },
  "application/vnd.japannet-setstore-wakeup": {
    "source": "iana"
  },
  "application/vnd.japannet-verification": {
    "source": "iana"
  },
  "application/vnd.japannet-verification-wakeup": {
    "source": "iana"
  },
  "application/vnd.jcp.javame.midlet-rms": {
    "source": "iana",
    "extensions": ["rms"]
  },
  "application/vnd.jisp": {
    "source": "iana",
    "extensions": ["jisp"]
  },
  "application/vnd.joost.joda-archive": {
    "source": "iana",
    "extensions": ["joda"]
  },
  "application/vnd.jsk.isdn-ngn": {
    "source": "iana"
  },
  "application/vnd.kahootz": {
    "source": "iana",
    "extensions": ["ktz","ktr"]
  },
  "application/vnd.kde.karbon": {
    "source": "iana",
    "extensions": ["karbon"]
  },
  "application/vnd.kde.kchart": {
    "source": "iana",
    "extensions": ["chrt"]
  },
  "application/vnd.kde.kformula": {
    "source": "iana",
    "extensions": ["kfo"]
  },
  "application/vnd.kde.kivio": {
    "source": "iana",
    "extensions": ["flw"]
  },
  "application/vnd.kde.kontour": {
    "source": "iana",
    "extensions": ["kon"]
  },
  "application/vnd.kde.kpresenter": {
    "source": "iana",
    "extensions": ["kpr","kpt"]
  },
  "application/vnd.kde.kspread": {
    "source": "iana",
    "extensions": ["ksp"]
  },
  "application/vnd.kde.kword": {
    "source": "iana",
    "extensions": ["kwd","kwt"]
  },
  "application/vnd.kenameaapp": {
    "source": "iana",
    "extensions": ["htke"]
  },
  "application/vnd.kidspiration": {
    "source": "iana",
    "extensions": ["kia"]
  },
  "application/vnd.kinar": {
    "source": "iana",
    "extensions": ["kne","knp"]
  },
  "application/vnd.koan": {
    "source": "iana",
    "extensions": ["skp","skd","skt","skm"]
  },
  "application/vnd.kodak-descriptor": {
    "source": "iana",
    "extensions": ["sse"]
  },
  "application/vnd.las.las+xml": {
    "source": "iana",
    "extensions": ["lasxml"]
  },
  "application/vnd.liberty-request+xml": {
    "source": "iana"
  },
  "application/vnd.llamagraphics.life-balance.desktop": {
    "source": "iana",
    "extensions": ["lbd"]
  },
  "application/vnd.llamagraphics.life-balance.exchange+xml": {
    "source": "iana",
    "extensions": ["lbe"]
  },
  "application/vnd.lotus-1-2-3": {
    "source": "iana",
    "extensions": ["123"]
  },
  "application/vnd.lotus-approach": {
    "source": "iana",
    "extensions": ["apr"]
  },
  "application/vnd.lotus-freelance": {
    "source": "iana",
    "extensions": ["pre"]
  },
  "application/vnd.lotus-notes": {
    "source": "iana",
    "extensions": ["nsf"]
  },
  "application/vnd.lotus-organizer": {
    "source": "iana",
    "extensions": ["org"]
  },
  "application/vnd.lotus-screencam": {
    "source": "iana",
    "extensions": ["scm"]
  },
  "application/vnd.lotus-wordpro": {
    "source": "iana",
    "extensions": ["lwp"]
  },
  "application/vnd.macports.portpkg": {
    "source": "iana",
    "extensions": ["portpkg"]
  },
  "application/vnd.marlin.drm.actiontoken+xml": {
    "source": "iana"
  },
  "application/vnd.marlin.drm.conftoken+xml": {
    "source": "iana"
  },
  "application/vnd.marlin.drm.license+xml": {
    "source": "iana"
  },
  "application/vnd.marlin.drm.mdcf": {
    "source": "iana"
  },
  "application/vnd.mason+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.maxmind.maxmind-db": {
    "source": "iana"
  },
  "application/vnd.mcd": {
    "source": "iana",
    "extensions": ["mcd"]
  },
  "application/vnd.medcalcdata": {
    "source": "iana",
    "extensions": ["mc1"]
  },
  "application/vnd.mediastation.cdkey": {
    "source": "iana",
    "extensions": ["cdkey"]
  },
  "application/vnd.meridian-slingshot": {
    "source": "iana"
  },
  "application/vnd.mfer": {
    "source": "iana",
    "extensions": ["mwf"]
  },
  "application/vnd.mfmp": {
    "source": "iana",
    "extensions": ["mfm"]
  },
  "application/vnd.micro+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.micrografx.flo": {
    "source": "iana",
    "extensions": ["flo"]
  },
  "application/vnd.micrografx.igx": {
    "source": "iana",
    "extensions": ["igx"]
  },
  "application/vnd.microsoft.portable-executable": {
    "source": "iana"
  },
  "application/vnd.miele+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.mif": {
    "source": "iana",
    "extensions": ["mif"]
  },
  "application/vnd.minisoft-hp3000-save": {
    "source": "iana"
  },
  "application/vnd.mitsubishi.misty-guard.trustweb": {
    "source": "iana"
  },
  "application/vnd.mobius.daf": {
    "source": "iana",
    "extensions": ["daf"]
  },
  "application/vnd.mobius.dis": {
    "source": "iana",
    "extensions": ["dis"]
  },
  "application/vnd.mobius.mbk": {
    "source": "iana",
    "extensions": ["mbk"]
  },
  "application/vnd.mobius.mqy": {
    "source": "iana",
    "extensions": ["mqy"]
  },
  "application/vnd.mobius.msl": {
    "source": "iana",
    "extensions": ["msl"]
  },
  "application/vnd.mobius.plc": {
    "source": "iana",
    "extensions": ["plc"]
  },
  "application/vnd.mobius.txf": {
    "source": "iana",
    "extensions": ["txf"]
  },
  "application/vnd.mophun.application": {
    "source": "iana",
    "extensions": ["mpn"]
  },
  "application/vnd.mophun.certificate": {
    "source": "iana",
    "extensions": ["mpc"]
  },
  "application/vnd.motorola.flexsuite": {
    "source": "iana"
  },
  "application/vnd.motorola.flexsuite.adsi": {
    "source": "iana"
  },
  "application/vnd.motorola.flexsuite.fis": {
    "source": "iana"
  },
  "application/vnd.motorola.flexsuite.gotap": {
    "source": "iana"
  },
  "application/vnd.motorola.flexsuite.kmr": {
    "source": "iana"
  },
  "application/vnd.motorola.flexsuite.ttc": {
    "source": "iana"
  },
  "application/vnd.motorola.flexsuite.wem": {
    "source": "iana"
  },
  "application/vnd.motorola.iprm": {
    "source": "iana"
  },
  "application/vnd.mozilla.xul+xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["xul"]
  },
  "application/vnd.ms-3mfdocument": {
    "source": "iana"
  },
  "application/vnd.ms-artgalry": {
    "source": "iana",
    "extensions": ["cil"]
  },
  "application/vnd.ms-asf": {
    "source": "iana"
  },
  "application/vnd.ms-cab-compressed": {
    "source": "iana",
    "extensions": ["cab"]
  },
  "application/vnd.ms-color.iccprofile": {
    "source": "apache"
  },
  "application/vnd.ms-excel": {
    "source": "iana",
    "compressible": false,
    "extensions": ["xls","xlm","xla","xlc","xlt","xlw"]
  },
  "application/vnd.ms-excel.addin.macroenabled.12": {
    "source": "iana",
    "extensions": ["xlam"]
  },
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": {
    "source": "iana",
    "extensions": ["xlsb"]
  },
  "application/vnd.ms-excel.sheet.macroenabled.12": {
    "source": "iana",
    "extensions": ["xlsm"]
  },
  "application/vnd.ms-excel.template.macroenabled.12": {
    "source": "iana",
    "extensions": ["xltm"]
  },
  "application/vnd.ms-fontobject": {
    "source": "iana",
    "compressible": true,
    "extensions": ["eot"]
  },
  "application/vnd.ms-htmlhelp": {
    "source": "iana",
    "extensions": ["chm"]
  },
  "application/vnd.ms-ims": {
    "source": "iana",
    "extensions": ["ims"]
  },
  "application/vnd.ms-lrm": {
    "source": "iana",
    "extensions": ["lrm"]
  },
  "application/vnd.ms-office.activex+xml": {
    "source": "iana"
  },
  "application/vnd.ms-officetheme": {
    "source": "iana",
    "extensions": ["thmx"]
  },
  "application/vnd.ms-opentype": {
    "source": "apache",
    "compressible": true
  },
  "application/vnd.ms-package.obfuscated-opentype": {
    "source": "apache"
  },
  "application/vnd.ms-pki.seccat": {
    "source": "apache",
    "extensions": ["cat"]
  },
  "application/vnd.ms-pki.stl": {
    "source": "apache",
    "extensions": ["stl"]
  },
  "application/vnd.ms-playready.initiator+xml": {
    "source": "iana"
  },
  "application/vnd.ms-powerpoint": {
    "source": "iana",
    "compressible": false,
    "extensions": ["ppt","pps","pot"]
  },
  "application/vnd.ms-powerpoint.addin.macroenabled.12": {
    "source": "iana",
    "extensions": ["ppam"]
  },
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": {
    "source": "iana",
    "extensions": ["pptm"]
  },
  "application/vnd.ms-powerpoint.slide.macroenabled.12": {
    "source": "iana",
    "extensions": ["sldm"]
  },
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": {
    "source": "iana",
    "extensions": ["ppsm"]
  },
  "application/vnd.ms-powerpoint.template.macroenabled.12": {
    "source": "iana",
    "extensions": ["potm"]
  },
  "application/vnd.ms-printing.printticket+xml": {
    "source": "apache"
  },
  "application/vnd.ms-project": {
    "source": "iana",
    "extensions": ["mpp","mpt"]
  },
  "application/vnd.ms-tnef": {
    "source": "iana"
  },
  "application/vnd.ms-windows.printerpairing": {
    "source": "iana"
  },
  "application/vnd.ms-wmdrm.lic-chlg-req": {
    "source": "iana"
  },
  "application/vnd.ms-wmdrm.lic-resp": {
    "source": "iana"
  },
  "application/vnd.ms-wmdrm.meter-chlg-req": {
    "source": "iana"
  },
  "application/vnd.ms-wmdrm.meter-resp": {
    "source": "iana"
  },
  "application/vnd.ms-word.document.macroenabled.12": {
    "source": "iana",
    "extensions": ["docm"]
  },
  "application/vnd.ms-word.template.macroenabled.12": {
    "source": "iana",
    "extensions": ["dotm"]
  },
  "application/vnd.ms-works": {
    "source": "iana",
    "extensions": ["wps","wks","wcm","wdb"]
  },
  "application/vnd.ms-wpl": {
    "source": "iana",
    "extensions": ["wpl"]
  },
  "application/vnd.ms-xpsdocument": {
    "source": "iana",
    "compressible": false,
    "extensions": ["xps"]
  },
  "application/vnd.msa-disk-image": {
    "source": "iana"
  },
  "application/vnd.mseq": {
    "source": "iana",
    "extensions": ["mseq"]
  },
  "application/vnd.msign": {
    "source": "iana"
  },
  "application/vnd.multiad.creator": {
    "source": "iana"
  },
  "application/vnd.multiad.creator.cif": {
    "source": "iana"
  },
  "application/vnd.music-niff": {
    "source": "iana"
  },
  "application/vnd.musician": {
    "source": "iana",
    "extensions": ["mus"]
  },
  "application/vnd.muvee.style": {
    "source": "iana",
    "extensions": ["msty"]
  },
  "application/vnd.mynfc": {
    "source": "iana",
    "extensions": ["taglet"]
  },
  "application/vnd.ncd.control": {
    "source": "iana"
  },
  "application/vnd.ncd.reference": {
    "source": "iana"
  },
  "application/vnd.nervana": {
    "source": "iana"
  },
  "application/vnd.netfpx": {
    "source": "iana"
  },
  "application/vnd.neurolanguage.nlu": {
    "source": "iana",
    "extensions": ["nlu"]
  },
  "application/vnd.nintendo.nitro.rom": {
    "source": "iana"
  },
  "application/vnd.nintendo.snes.rom": {
    "source": "iana"
  },
  "application/vnd.nitf": {
    "source": "iana",
    "extensions": ["ntf","nitf"]
  },
  "application/vnd.noblenet-directory": {
    "source": "iana",
    "extensions": ["nnd"]
  },
  "application/vnd.noblenet-sealer": {
    "source": "iana",
    "extensions": ["nns"]
  },
  "application/vnd.noblenet-web": {
    "source": "iana",
    "extensions": ["nnw"]
  },
  "application/vnd.nokia.catalogs": {
    "source": "iana"
  },
  "application/vnd.nokia.conml+wbxml": {
    "source": "iana"
  },
  "application/vnd.nokia.conml+xml": {
    "source": "iana"
  },
  "application/vnd.nokia.iptv.config+xml": {
    "source": "iana"
  },
  "application/vnd.nokia.isds-radio-presets": {
    "source": "iana"
  },
  "application/vnd.nokia.landmark+wbxml": {
    "source": "iana"
  },
  "application/vnd.nokia.landmark+xml": {
    "source": "iana"
  },
  "application/vnd.nokia.landmarkcollection+xml": {
    "source": "iana"
  },
  "application/vnd.nokia.n-gage.ac+xml": {
    "source": "iana"
  },
  "application/vnd.nokia.n-gage.data": {
    "source": "iana",
    "extensions": ["ngdat"]
  },
  "application/vnd.nokia.n-gage.symbian.install": {
    "source": "iana",
    "extensions": ["n-gage"]
  },
  "application/vnd.nokia.ncd": {
    "source": "iana"
  },
  "application/vnd.nokia.pcd+wbxml": {
    "source": "iana"
  },
  "application/vnd.nokia.pcd+xml": {
    "source": "iana"
  },
  "application/vnd.nokia.radio-preset": {
    "source": "iana",
    "extensions": ["rpst"]
  },
  "application/vnd.nokia.radio-presets": {
    "source": "iana",
    "extensions": ["rpss"]
  },
  "application/vnd.novadigm.edm": {
    "source": "iana",
    "extensions": ["edm"]
  },
  "application/vnd.novadigm.edx": {
    "source": "iana",
    "extensions": ["edx"]
  },
  "application/vnd.novadigm.ext": {
    "source": "iana",
    "extensions": ["ext"]
  },
  "application/vnd.ntt-local.content-share": {
    "source": "iana"
  },
  "application/vnd.ntt-local.file-transfer": {
    "source": "iana"
  },
  "application/vnd.ntt-local.ogw_remote-access": {
    "source": "iana"
  },
  "application/vnd.ntt-local.sip-ta_remote": {
    "source": "iana"
  },
  "application/vnd.ntt-local.sip-ta_tcp_stream": {
    "source": "iana"
  },
  "application/vnd.oasis.opendocument.chart": {
    "source": "iana",
    "extensions": ["odc"]
  },
  "application/vnd.oasis.opendocument.chart-template": {
    "source": "iana",
    "extensions": ["otc"]
  },
  "application/vnd.oasis.opendocument.database": {
    "source": "iana",
    "extensions": ["odb"]
  },
  "application/vnd.oasis.opendocument.formula": {
    "source": "iana",
    "extensions": ["odf"]
  },
  "application/vnd.oasis.opendocument.formula-template": {
    "source": "iana",
    "extensions": ["odft"]
  },
  "application/vnd.oasis.opendocument.graphics": {
    "source": "iana",
    "compressible": false,
    "extensions": ["odg"]
  },
  "application/vnd.oasis.opendocument.graphics-template": {
    "source": "iana",
    "extensions": ["otg"]
  },
  "application/vnd.oasis.opendocument.image": {
    "source": "iana",
    "extensions": ["odi"]
  },
  "application/vnd.oasis.opendocument.image-template": {
    "source": "iana",
    "extensions": ["oti"]
  },
  "application/vnd.oasis.opendocument.presentation": {
    "source": "iana",
    "compressible": false,
    "extensions": ["odp"]
  },
  "application/vnd.oasis.opendocument.presentation-template": {
    "source": "iana",
    "extensions": ["otp"]
  },
  "application/vnd.oasis.opendocument.spreadsheet": {
    "source": "iana",
    "compressible": false,
    "extensions": ["ods"]
  },
  "application/vnd.oasis.opendocument.spreadsheet-template": {
    "source": "iana",
    "extensions": ["ots"]
  },
  "application/vnd.oasis.opendocument.text": {
    "source": "iana",
    "compressible": false,
    "extensions": ["odt"]
  },
  "application/vnd.oasis.opendocument.text-master": {
    "source": "iana",
    "extensions": ["odm"]
  },
  "application/vnd.oasis.opendocument.text-template": {
    "source": "iana",
    "extensions": ["ott"]
  },
  "application/vnd.oasis.opendocument.text-web": {
    "source": "iana",
    "extensions": ["oth"]
  },
  "application/vnd.obn": {
    "source": "iana"
  },
  "application/vnd.oftn.l10n+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.oipf.contentaccessdownload+xml": {
    "source": "iana"
  },
  "application/vnd.oipf.contentaccessstreaming+xml": {
    "source": "iana"
  },
  "application/vnd.oipf.cspg-hexbinary": {
    "source": "iana"
  },
  "application/vnd.oipf.dae.svg+xml": {
    "source": "iana"
  },
  "application/vnd.oipf.dae.xhtml+xml": {
    "source": "iana"
  },
  "application/vnd.oipf.mippvcontrolmessage+xml": {
    "source": "iana"
  },
  "application/vnd.oipf.pae.gem": {
    "source": "iana"
  },
  "application/vnd.oipf.spdiscovery+xml": {
    "source": "iana"
  },
  "application/vnd.oipf.spdlist+xml": {
    "source": "iana"
  },
  "application/vnd.oipf.ueprofile+xml": {
    "source": "iana"
  },
  "application/vnd.oipf.userprofile+xml": {
    "source": "iana"
  },
  "application/vnd.olpc-sugar": {
    "source": "iana",
    "extensions": ["xo"]
  },
  "application/vnd.oma-scws-config": {
    "source": "iana"
  },
  "application/vnd.oma-scws-http-request": {
    "source": "iana"
  },
  "application/vnd.oma-scws-http-response": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.associated-procedure-parameter+xml": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.drm-trigger+xml": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.imd+xml": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.ltkm": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.notification+xml": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.provisioningtrigger": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.sgboot": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.sgdd+xml": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.sgdu": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.simple-symbol-container": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.smartcard-trigger+xml": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.sprov+xml": {
    "source": "iana"
  },
  "application/vnd.oma.bcast.stkm": {
    "source": "iana"
  },
  "application/vnd.oma.cab-address-book+xml": {
    "source": "iana"
  },
  "application/vnd.oma.cab-feature-handler+xml": {
    "source": "iana"
  },
  "application/vnd.oma.cab-pcc+xml": {
    "source": "iana"
  },
  "application/vnd.oma.cab-subs-invite+xml": {
    "source": "iana"
  },
  "application/vnd.oma.cab-user-prefs+xml": {
    "source": "iana"
  },
  "application/vnd.oma.dcd": {
    "source": "iana"
  },
  "application/vnd.oma.dcdc": {
    "source": "iana"
  },
  "application/vnd.oma.dd2+xml": {
    "source": "iana",
    "extensions": ["dd2"]
  },
  "application/vnd.oma.drm.risd+xml": {
    "source": "iana"
  },
  "application/vnd.oma.group-usage-list+xml": {
    "source": "iana"
  },
  "application/vnd.oma.pal+xml": {
    "source": "iana"
  },
  "application/vnd.oma.poc.detailed-progress-report+xml": {
    "source": "iana"
  },
  "application/vnd.oma.poc.final-report+xml": {
    "source": "iana"
  },
  "application/vnd.oma.poc.groups+xml": {
    "source": "iana"
  },
  "application/vnd.oma.poc.invocation-descriptor+xml": {
    "source": "iana"
  },
  "application/vnd.oma.poc.optimized-progress-report+xml": {
    "source": "iana"
  },
  "application/vnd.oma.push": {
    "source": "iana"
  },
  "application/vnd.oma.scidm.messages+xml": {
    "source": "iana"
  },
  "application/vnd.oma.xcap-directory+xml": {
    "source": "iana"
  },
  "application/vnd.omads-email+xml": {
    "source": "iana"
  },
  "application/vnd.omads-file+xml": {
    "source": "iana"
  },
  "application/vnd.omads-folder+xml": {
    "source": "iana"
  },
  "application/vnd.omaloc-supl-init": {
    "source": "iana"
  },
  "application/vnd.openeye.oeb": {
    "source": "iana"
  },
  "application/vnd.openofficeorg.extension": {
    "source": "apache",
    "extensions": ["oxt"]
  },
  "application/vnd.openxmlformats-officedocument.custom-properties+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.drawing+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.extended-properties+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml-template": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    "source": "iana",
    "compressible": false,
    "extensions": ["pptx"]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slide": {
    "source": "iana",
    "extensions": ["sldx"]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": {
    "source": "iana",
    "extensions": ["ppsx"]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.template": {
    "source": "apache",
    "extensions": ["potx"]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml-template": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    "source": "iana",
    "compressible": false,
    "extensions": ["xlsx"]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": {
    "source": "apache",
    "extensions": ["xltx"]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.theme+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.themeoverride+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.vmldrawing": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml-template": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    "source": "iana",
    "compressible": false,
    "extensions": ["docx"]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": {
    "source": "apache",
    "extensions": ["dotx"]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-package.core-properties+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {
    "source": "iana"
  },
  "application/vnd.openxmlformats-package.relationships+xml": {
    "source": "iana"
  },
  "application/vnd.oracle.resource+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.orange.indata": {
    "source": "iana"
  },
  "application/vnd.osa.netdeploy": {
    "source": "iana"
  },
  "application/vnd.osgeo.mapguide.package": {
    "source": "iana",
    "extensions": ["mgp"]
  },
  "application/vnd.osgi.bundle": {
    "source": "iana"
  },
  "application/vnd.osgi.dp": {
    "source": "iana",
    "extensions": ["dp"]
  },
  "application/vnd.osgi.subsystem": {
    "source": "iana",
    "extensions": ["esa"]
  },
  "application/vnd.otps.ct-kip+xml": {
    "source": "iana"
  },
  "application/vnd.palm": {
    "source": "iana",
    "extensions": ["pdb","pqa","oprc"]
  },
  "application/vnd.panoply": {
    "source": "iana"
  },
  "application/vnd.paos+xml": {
    "source": "iana"
  },
  "application/vnd.paos.xml": {
    "source": "apache"
  },
  "application/vnd.pawaafile": {
    "source": "iana",
    "extensions": ["paw"]
  },
  "application/vnd.pcos": {
    "source": "iana"
  },
  "application/vnd.pg.format": {
    "source": "iana",
    "extensions": ["str"]
  },
  "application/vnd.pg.osasli": {
    "source": "iana",
    "extensions": ["ei6"]
  },
  "application/vnd.piaccess.application-licence": {
    "source": "iana"
  },
  "application/vnd.picsel": {
    "source": "iana",
    "extensions": ["efif"]
  },
  "application/vnd.pmi.widget": {
    "source": "iana",
    "extensions": ["wg"]
  },
  "application/vnd.poc.group-advertisement+xml": {
    "source": "iana"
  },
  "application/vnd.pocketlearn": {
    "source": "iana",
    "extensions": ["plf"]
  },
  "application/vnd.powerbuilder6": {
    "source": "iana",
    "extensions": ["pbd"]
  },
  "application/vnd.powerbuilder6-s": {
    "source": "iana"
  },
  "application/vnd.powerbuilder7": {
    "source": "iana"
  },
  "application/vnd.powerbuilder7-s": {
    "source": "iana"
  },
  "application/vnd.powerbuilder75": {
    "source": "iana"
  },
  "application/vnd.powerbuilder75-s": {
    "source": "iana"
  },
  "application/vnd.preminet": {
    "source": "iana"
  },
  "application/vnd.previewsystems.box": {
    "source": "iana",
    "extensions": ["box"]
  },
  "application/vnd.proteus.magazine": {
    "source": "iana",
    "extensions": ["mgz"]
  },
  "application/vnd.publishare-delta-tree": {
    "source": "iana",
    "extensions": ["qps"]
  },
  "application/vnd.pvi.ptid1": {
    "source": "iana",
    "extensions": ["ptid"]
  },
  "application/vnd.pwg-multiplexed": {
    "source": "iana"
  },
  "application/vnd.pwg-xhtml-print+xml": {
    "source": "iana"
  },
  "application/vnd.qualcomm.brew-app-res": {
    "source": "iana"
  },
  "application/vnd.quark.quarkxpress": {
    "source": "iana",
    "extensions": ["qxd","qxt","qwd","qwt","qxl","qxb"]
  },
  "application/vnd.quobject-quoxdocument": {
    "source": "iana"
  },
  "application/vnd.radisys.moml+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-audit+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-audit-conf+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-audit-conn+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-audit-dialog+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-audit-stream+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-conf+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-dialog+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-dialog-base+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-dialog-fax-detect+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-dialog-group+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-dialog-speech+xml": {
    "source": "iana"
  },
  "application/vnd.radisys.msml-dialog-transform+xml": {
    "source": "iana"
  },
  "application/vnd.rainstor.data": {
    "source": "iana"
  },
  "application/vnd.rapid": {
    "source": "iana"
  },
  "application/vnd.realvnc.bed": {
    "source": "iana",
    "extensions": ["bed"]
  },
  "application/vnd.recordare.musicxml": {
    "source": "iana",
    "extensions": ["mxl"]
  },
  "application/vnd.recordare.musicxml+xml": {
    "source": "iana",
    "extensions": ["musicxml"]
  },
  "application/vnd.renlearn.rlprint": {
    "source": "iana"
  },
  "application/vnd.rig.cryptonote": {
    "source": "iana",
    "extensions": ["cryptonote"]
  },
  "application/vnd.rim.cod": {
    "source": "apache",
    "extensions": ["cod"]
  },
  "application/vnd.rn-realmedia": {
    "source": "apache",
    "extensions": ["rm"]
  },
  "application/vnd.rn-realmedia-vbr": {
    "source": "apache",
    "extensions": ["rmvb"]
  },
  "application/vnd.route66.link66+xml": {
    "source": "iana",
    "extensions": ["link66"]
  },
  "application/vnd.rs-274x": {
    "source": "iana"
  },
  "application/vnd.ruckus.download": {
    "source": "iana"
  },
  "application/vnd.s3sms": {
    "source": "iana"
  },
  "application/vnd.sailingtracker.track": {
    "source": "iana",
    "extensions": ["st"]
  },
  "application/vnd.sbm.cid": {
    "source": "iana"
  },
  "application/vnd.sbm.mid2": {
    "source": "iana"
  },
  "application/vnd.scribus": {
    "source": "iana"
  },
  "application/vnd.sealed.3df": {
    "source": "iana"
  },
  "application/vnd.sealed.csf": {
    "source": "iana"
  },
  "application/vnd.sealed.doc": {
    "source": "iana"
  },
  "application/vnd.sealed.eml": {
    "source": "iana"
  },
  "application/vnd.sealed.mht": {
    "source": "iana"
  },
  "application/vnd.sealed.net": {
    "source": "iana"
  },
  "application/vnd.sealed.ppt": {
    "source": "iana"
  },
  "application/vnd.sealed.tiff": {
    "source": "iana"
  },
  "application/vnd.sealed.xls": {
    "source": "iana"
  },
  "application/vnd.sealedmedia.softseal.html": {
    "source": "iana"
  },
  "application/vnd.sealedmedia.softseal.pdf": {
    "source": "iana"
  },
  "application/vnd.seemail": {
    "source": "iana",
    "extensions": ["see"]
  },
  "application/vnd.sema": {
    "source": "iana",
    "extensions": ["sema"]
  },
  "application/vnd.semd": {
    "source": "iana",
    "extensions": ["semd"]
  },
  "application/vnd.semf": {
    "source": "iana",
    "extensions": ["semf"]
  },
  "application/vnd.shana.informed.formdata": {
    "source": "iana",
    "extensions": ["ifm"]
  },
  "application/vnd.shana.informed.formtemplate": {
    "source": "iana",
    "extensions": ["itp"]
  },
  "application/vnd.shana.informed.interchange": {
    "source": "iana",
    "extensions": ["iif"]
  },
  "application/vnd.shana.informed.package": {
    "source": "iana",
    "extensions": ["ipk"]
  },
  "application/vnd.simtech-mindmapper": {
    "source": "iana",
    "extensions": ["twd","twds"]
  },
  "application/vnd.siren+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.smaf": {
    "source": "iana",
    "extensions": ["mmf"]
  },
  "application/vnd.smart.notebook": {
    "source": "iana"
  },
  "application/vnd.smart.teacher": {
    "source": "iana",
    "extensions": ["teacher"]
  },
  "application/vnd.software602.filler.form+xml": {
    "source": "iana"
  },
  "application/vnd.software602.filler.form-xml-zip": {
    "source": "iana"
  },
  "application/vnd.solent.sdkm+xml": {
    "source": "iana",
    "extensions": ["sdkm","sdkd"]
  },
  "application/vnd.spotfire.dxp": {
    "source": "iana",
    "extensions": ["dxp"]
  },
  "application/vnd.spotfire.sfs": {
    "source": "iana",
    "extensions": ["sfs"]
  },
  "application/vnd.sss-cod": {
    "source": "iana"
  },
  "application/vnd.sss-dtf": {
    "source": "iana"
  },
  "application/vnd.sss-ntf": {
    "source": "iana"
  },
  "application/vnd.stardivision.calc": {
    "source": "apache",
    "extensions": ["sdc"]
  },
  "application/vnd.stardivision.draw": {
    "source": "apache",
    "extensions": ["sda"]
  },
  "application/vnd.stardivision.impress": {
    "source": "apache",
    "extensions": ["sdd"]
  },
  "application/vnd.stardivision.math": {
    "source": "apache",
    "extensions": ["smf"]
  },
  "application/vnd.stardivision.writer": {
    "source": "apache",
    "extensions": ["sdw","vor"]
  },
  "application/vnd.stardivision.writer-global": {
    "source": "apache",
    "extensions": ["sgl"]
  },
  "application/vnd.stepmania.package": {
    "source": "iana",
    "extensions": ["smzip"]
  },
  "application/vnd.stepmania.stepchart": {
    "source": "iana",
    "extensions": ["sm"]
  },
  "application/vnd.street-stream": {
    "source": "iana"
  },
  "application/vnd.sun.wadl+xml": {
    "source": "iana"
  },
  "application/vnd.sun.xml.calc": {
    "source": "apache",
    "extensions": ["sxc"]
  },
  "application/vnd.sun.xml.calc.template": {
    "source": "apache",
    "extensions": ["stc"]
  },
  "application/vnd.sun.xml.draw": {
    "source": "apache",
    "extensions": ["sxd"]
  },
  "application/vnd.sun.xml.draw.template": {
    "source": "apache",
    "extensions": ["std"]
  },
  "application/vnd.sun.xml.impress": {
    "source": "apache",
    "extensions": ["sxi"]
  },
  "application/vnd.sun.xml.impress.template": {
    "source": "apache",
    "extensions": ["sti"]
  },
  "application/vnd.sun.xml.math": {
    "source": "apache",
    "extensions": ["sxm"]
  },
  "application/vnd.sun.xml.writer": {
    "source": "apache",
    "extensions": ["sxw"]
  },
  "application/vnd.sun.xml.writer.global": {
    "source": "apache",
    "extensions": ["sxg"]
  },
  "application/vnd.sun.xml.writer.template": {
    "source": "apache",
    "extensions": ["stw"]
  },
  "application/vnd.sus-calendar": {
    "source": "iana",
    "extensions": ["sus","susp"]
  },
  "application/vnd.svd": {
    "source": "iana",
    "extensions": ["svd"]
  },
  "application/vnd.swiftview-ics": {
    "source": "iana"
  },
  "application/vnd.symbian.install": {
    "source": "apache",
    "extensions": ["sis","sisx"]
  },
  "application/vnd.syncml+xml": {
    "source": "iana",
    "extensions": ["xsm"]
  },
  "application/vnd.syncml.dm+wbxml": {
    "source": "iana",
    "extensions": ["bdm"]
  },
  "application/vnd.syncml.dm+xml": {
    "source": "iana",
    "extensions": ["xdm"]
  },
  "application/vnd.syncml.dm.notification": {
    "source": "iana"
  },
  "application/vnd.syncml.dmddf+wbxml": {
    "source": "iana"
  },
  "application/vnd.syncml.dmddf+xml": {
    "source": "iana"
  },
  "application/vnd.syncml.dmtnds+wbxml": {
    "source": "iana"
  },
  "application/vnd.syncml.dmtnds+xml": {
    "source": "iana"
  },
  "application/vnd.syncml.ds.notification": {
    "source": "iana"
  },
  "application/vnd.tao.intent-module-archive": {
    "source": "iana",
    "extensions": ["tao"]
  },
  "application/vnd.tcpdump.pcap": {
    "source": "iana",
    "extensions": ["pcap","cap","dmp"]
  },
  "application/vnd.tmd.mediaflex.api+xml": {
    "source": "iana"
  },
  "application/vnd.tmobile-livetv": {
    "source": "iana",
    "extensions": ["tmo"]
  },
  "application/vnd.trid.tpt": {
    "source": "iana",
    "extensions": ["tpt"]
  },
  "application/vnd.triscape.mxs": {
    "source": "iana",
    "extensions": ["mxs"]
  },
  "application/vnd.trueapp": {
    "source": "iana",
    "extensions": ["tra"]
  },
  "application/vnd.truedoc": {
    "source": "iana"
  },
  "application/vnd.ubisoft.webplayer": {
    "source": "iana"
  },
  "application/vnd.ufdl": {
    "source": "iana",
    "extensions": ["ufd","ufdl"]
  },
  "application/vnd.uiq.theme": {
    "source": "iana",
    "extensions": ["utz"]
  },
  "application/vnd.umajin": {
    "source": "iana",
    "extensions": ["umj"]
  },
  "application/vnd.unity": {
    "source": "iana",
    "extensions": ["unityweb"]
  },
  "application/vnd.uoml+xml": {
    "source": "iana",
    "extensions": ["uoml"]
  },
  "application/vnd.uplanet.alert": {
    "source": "iana"
  },
  "application/vnd.uplanet.alert-wbxml": {
    "source": "iana"
  },
  "application/vnd.uplanet.bearer-choice": {
    "source": "iana"
  },
  "application/vnd.uplanet.bearer-choice-wbxml": {
    "source": "iana"
  },
  "application/vnd.uplanet.cacheop": {
    "source": "iana"
  },
  "application/vnd.uplanet.cacheop-wbxml": {
    "source": "iana"
  },
  "application/vnd.uplanet.channel": {
    "source": "iana"
  },
  "application/vnd.uplanet.channel-wbxml": {
    "source": "iana"
  },
  "application/vnd.uplanet.list": {
    "source": "iana"
  },
  "application/vnd.uplanet.list-wbxml": {
    "source": "iana"
  },
  "application/vnd.uplanet.listcmd": {
    "source": "iana"
  },
  "application/vnd.uplanet.listcmd-wbxml": {
    "source": "iana"
  },
  "application/vnd.uplanet.signal": {
    "source": "iana"
  },
  "application/vnd.valve.source.material": {
    "source": "iana"
  },
  "application/vnd.vcx": {
    "source": "iana",
    "extensions": ["vcx"]
  },
  "application/vnd.vd-study": {
    "source": "iana"
  },
  "application/vnd.vectorworks": {
    "source": "iana"
  },
  "application/vnd.verimatrix.vcas": {
    "source": "iana"
  },
  "application/vnd.vidsoft.vidconference": {
    "source": "iana"
  },
  "application/vnd.visio": {
    "source": "iana",
    "extensions": ["vsd","vst","vss","vsw"]
  },
  "application/vnd.visionary": {
    "source": "iana",
    "extensions": ["vis"]
  },
  "application/vnd.vividence.scriptfile": {
    "source": "iana"
  },
  "application/vnd.vsf": {
    "source": "iana",
    "extensions": ["vsf"]
  },
  "application/vnd.wap.sic": {
    "source": "iana"
  },
  "application/vnd.wap.slc": {
    "source": "iana"
  },
  "application/vnd.wap.wbxml": {
    "source": "iana",
    "extensions": ["wbxml"]
  },
  "application/vnd.wap.wmlc": {
    "source": "iana",
    "extensions": ["wmlc"]
  },
  "application/vnd.wap.wmlscriptc": {
    "source": "iana",
    "extensions": ["wmlsc"]
  },
  "application/vnd.webturbo": {
    "source": "iana",
    "extensions": ["wtb"]
  },
  "application/vnd.wfa.p2p": {
    "source": "iana"
  },
  "application/vnd.wfa.wsc": {
    "source": "iana"
  },
  "application/vnd.windows.devicepairing": {
    "source": "iana"
  },
  "application/vnd.wmc": {
    "source": "iana"
  },
  "application/vnd.wmf.bootstrap": {
    "source": "iana"
  },
  "application/vnd.wolfram.mathematica": {
    "source": "iana"
  },
  "application/vnd.wolfram.mathematica.package": {
    "source": "iana"
  },
  "application/vnd.wolfram.player": {
    "source": "iana",
    "extensions": ["nbp"]
  },
  "application/vnd.wordperfect": {
    "source": "iana",
    "extensions": ["wpd"]
  },
  "application/vnd.wqd": {
    "source": "iana",
    "extensions": ["wqd"]
  },
  "application/vnd.wrq-hp3000-labelled": {
    "source": "iana"
  },
  "application/vnd.wt.stf": {
    "source": "iana",
    "extensions": ["stf"]
  },
  "application/vnd.wv.csp+wbxml": {
    "source": "iana"
  },
  "application/vnd.wv.csp+xml": {
    "source": "iana"
  },
  "application/vnd.wv.ssp+xml": {
    "source": "iana"
  },
  "application/vnd.xacml+json": {
    "source": "iana",
    "compressible": true
  },
  "application/vnd.xara": {
    "source": "iana",
    "extensions": ["xar"]
  },
  "application/vnd.xfdl": {
    "source": "iana",
    "extensions": ["xfdl"]
  },
  "application/vnd.xfdl.webform": {
    "source": "iana"
  },
  "application/vnd.xmi+xml": {
    "source": "iana"
  },
  "application/vnd.xmpie.cpkg": {
    "source": "iana"
  },
  "application/vnd.xmpie.dpkg": {
    "source": "iana"
  },
  "application/vnd.xmpie.plan": {
    "source": "iana"
  },
  "application/vnd.xmpie.ppkg": {
    "source": "iana"
  },
  "application/vnd.xmpie.xlim": {
    "source": "iana"
  },
  "application/vnd.yamaha.hv-dic": {
    "source": "iana",
    "extensions": ["hvd"]
  },
  "application/vnd.yamaha.hv-script": {
    "source": "iana",
    "extensions": ["hvs"]
  },
  "application/vnd.yamaha.hv-voice": {
    "source": "iana",
    "extensions": ["hvp"]
  },
  "application/vnd.yamaha.openscoreformat": {
    "source": "iana",
    "extensions": ["osf"]
  },
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": {
    "source": "iana",
    "extensions": ["osfpvg"]
  },
  "application/vnd.yamaha.remote-setup": {
    "source": "iana"
  },
  "application/vnd.yamaha.smaf-audio": {
    "source": "iana",
    "extensions": ["saf"]
  },
  "application/vnd.yamaha.smaf-phrase": {
    "source": "iana",
    "extensions": ["spf"]
  },
  "application/vnd.yamaha.through-ngn": {
    "source": "iana"
  },
  "application/vnd.yamaha.tunnel-udpencap": {
    "source": "iana"
  },
  "application/vnd.yaoweme": {
    "source": "iana"
  },
  "application/vnd.yellowriver-custom-menu": {
    "source": "iana",
    "extensions": ["cmp"]
  },
  "application/vnd.zul": {
    "source": "iana",
    "extensions": ["zir","zirz"]
  },
  "application/vnd.zzazz.deck+xml": {
    "source": "iana",
    "extensions": ["zaz"]
  },
  "application/voicexml+xml": {
    "source": "iana",
    "extensions": ["vxml"]
  },
  "application/vq-rtcpxr": {
    "source": "iana"
  },
  "application/watcherinfo+xml": {
    "source": "iana"
  },
  "application/whoispp-query": {
    "source": "iana"
  },
  "application/whoispp-response": {
    "source": "iana"
  },
  "application/widget": {
    "source": "iana",
    "extensions": ["wgt"]
  },
  "application/winhlp": {
    "source": "apache",
    "extensions": ["hlp"]
  },
  "application/wita": {
    "source": "iana"
  },
  "application/wordperfect5.1": {
    "source": "iana"
  },
  "application/wsdl+xml": {
    "source": "iana",
    "extensions": ["wsdl"]
  },
  "application/wspolicy+xml": {
    "source": "iana",
    "extensions": ["wspolicy"]
  },
  "application/x-7z-compressed": {
    "source": "apache",
    "compressible": false,
    "extensions": ["7z"]
  },
  "application/x-abiword": {
    "source": "apache",
    "extensions": ["abw"]
  },
  "application/x-ace-compressed": {
    "source": "apache",
    "extensions": ["ace"]
  },
  "application/x-amf": {
    "source": "apache"
  },
  "application/x-apple-diskimage": {
    "source": "apache",
    "extensions": ["dmg"]
  },
  "application/x-authorware-bin": {
    "source": "apache",
    "extensions": ["aab","x32","u32","vox"]
  },
  "application/x-authorware-map": {
    "source": "apache",
    "extensions": ["aam"]
  },
  "application/x-authorware-seg": {
    "source": "apache",
    "extensions": ["aas"]
  },
  "application/x-bcpio": {
    "source": "apache",
    "extensions": ["bcpio"]
  },
  "application/x-bdoc": {
    "compressible": false,
    "extensions": ["bdoc"]
  },
  "application/x-bittorrent": {
    "source": "apache",
    "extensions": ["torrent"]
  },
  "application/x-blorb": {
    "source": "apache",
    "extensions": ["blb","blorb"]
  },
  "application/x-bzip": {
    "source": "apache",
    "compressible": false,
    "extensions": ["bz"]
  },
  "application/x-bzip2": {
    "source": "apache",
    "compressible": false,
    "extensions": ["bz2","boz"]
  },
  "application/x-cbr": {
    "source": "apache",
    "extensions": ["cbr","cba","cbt","cbz","cb7"]
  },
  "application/x-cdlink": {
    "source": "apache",
    "extensions": ["vcd"]
  },
  "application/x-cfs-compressed": {
    "source": "apache",
    "extensions": ["cfs"]
  },
  "application/x-chat": {
    "source": "apache",
    "extensions": ["chat"]
  },
  "application/x-chess-pgn": {
    "source": "apache",
    "extensions": ["pgn"]
  },
  "application/x-chrome-extension": {
    "extensions": ["crx"]
  },
  "application/x-cocoa": {
    "source": "nginx",
    "extensions": ["cco"]
  },
  "application/x-compress": {
    "source": "apache"
  },
  "application/x-conference": {
    "source": "apache",
    "extensions": ["nsc"]
  },
  "application/x-cpio": {
    "source": "apache",
    "extensions": ["cpio"]
  },
  "application/x-csh": {
    "source": "apache",
    "extensions": ["csh"]
  },
  "application/x-deb": {
    "compressible": false
  },
  "application/x-debian-package": {
    "source": "apache",
    "extensions": ["deb","udeb"]
  },
  "application/x-dgc-compressed": {
    "source": "apache",
    "extensions": ["dgc"]
  },
  "application/x-director": {
    "source": "apache",
    "extensions": ["dir","dcr","dxr","cst","cct","cxt","w3d","fgd","swa"]
  },
  "application/x-doom": {
    "source": "apache",
    "extensions": ["wad"]
  },
  "application/x-dtbncx+xml": {
    "source": "apache",
    "extensions": ["ncx"]
  },
  "application/x-dtbook+xml": {
    "source": "apache",
    "extensions": ["dtb"]
  },
  "application/x-dtbresource+xml": {
    "source": "apache",
    "extensions": ["res"]
  },
  "application/x-dvi": {
    "source": "apache",
    "compressible": false,
    "extensions": ["dvi"]
  },
  "application/x-envoy": {
    "source": "apache",
    "extensions": ["evy"]
  },
  "application/x-eva": {
    "source": "apache",
    "extensions": ["eva"]
  },
  "application/x-font-bdf": {
    "source": "apache",
    "extensions": ["bdf"]
  },
  "application/x-font-dos": {
    "source": "apache"
  },
  "application/x-font-framemaker": {
    "source": "apache"
  },
  "application/x-font-ghostscript": {
    "source": "apache",
    "extensions": ["gsf"]
  },
  "application/x-font-libgrx": {
    "source": "apache"
  },
  "application/x-font-linux-psf": {
    "source": "apache",
    "extensions": ["psf"]
  },
  "application/x-font-otf": {
    "source": "apache",
    "compressible": true,
    "extensions": ["otf"]
  },
  "application/x-font-pcf": {
    "source": "apache",
    "extensions": ["pcf"]
  },
  "application/x-font-snf": {
    "source": "apache",
    "extensions": ["snf"]
  },
  "application/x-font-speedo": {
    "source": "apache"
  },
  "application/x-font-sunos-news": {
    "source": "apache"
  },
  "application/x-font-ttf": {
    "source": "apache",
    "compressible": true,
    "extensions": ["ttf","ttc"]
  },
  "application/x-font-type1": {
    "source": "apache",
    "extensions": ["pfa","pfb","pfm","afm"]
  },
  "application/x-font-vfont": {
    "source": "apache"
  },
  "application/x-freearc": {
    "source": "apache",
    "extensions": ["arc"]
  },
  "application/x-futuresplash": {
    "source": "apache",
    "extensions": ["spl"]
  },
  "application/x-gca-compressed": {
    "source": "apache",
    "extensions": ["gca"]
  },
  "application/x-glulx": {
    "source": "apache",
    "extensions": ["ulx"]
  },
  "application/x-gnumeric": {
    "source": "apache",
    "extensions": ["gnumeric"]
  },
  "application/x-gramps-xml": {
    "source": "apache",
    "extensions": ["gramps"]
  },
  "application/x-gtar": {
    "source": "apache",
    "extensions": ["gtar"]
  },
  "application/x-gzip": {
    "source": "apache"
  },
  "application/x-hdf": {
    "source": "apache",
    "extensions": ["hdf"]
  },
  "application/x-httpd-php": {
    "compressible": true,
    "extensions": ["php"]
  },
  "application/x-install-instructions": {
    "source": "apache",
    "extensions": ["install"]
  },
  "application/x-iso9660-image": {
    "source": "apache",
    "extensions": ["iso"]
  },
  "application/x-java-archive-diff": {
    "source": "nginx",
    "extensions": ["jardiff"]
  },
  "application/x-java-jnlp-file": {
    "source": "apache",
    "compressible": false,
    "extensions": ["jnlp"]
  },
  "application/x-javascript": {
    "compressible": true
  },
  "application/x-latex": {
    "source": "apache",
    "compressible": false,
    "extensions": ["latex"]
  },
  "application/x-lua-bytecode": {
    "extensions": ["luac"]
  },
  "application/x-lzh-compressed": {
    "source": "apache",
    "extensions": ["lzh","lha"]
  },
  "application/x-makeself": {
    "source": "nginx",
    "extensions": ["run"]
  },
  "application/x-mie": {
    "source": "apache",
    "extensions": ["mie"]
  },
  "application/x-mobipocket-ebook": {
    "source": "apache",
    "extensions": ["prc","mobi"]
  },
  "application/x-mpegurl": {
    "compressible": false
  },
  "application/x-ms-application": {
    "source": "apache",
    "extensions": ["application"]
  },
  "application/x-ms-shortcut": {
    "source": "apache",
    "extensions": ["lnk"]
  },
  "application/x-ms-wmd": {
    "source": "apache",
    "extensions": ["wmd"]
  },
  "application/x-ms-wmz": {
    "source": "apache",
    "extensions": ["wmz"]
  },
  "application/x-ms-xbap": {
    "source": "apache",
    "extensions": ["xbap"]
  },
  "application/x-msaccess": {
    "source": "apache",
    "extensions": ["mdb"]
  },
  "application/x-msbinder": {
    "source": "apache",
    "extensions": ["obd"]
  },
  "application/x-mscardfile": {
    "source": "apache",
    "extensions": ["crd"]
  },
  "application/x-msclip": {
    "source": "apache",
    "extensions": ["clp"]
  },
  "application/x-msdownload": {
    "source": "apache",
    "extensions": ["exe","dll","com","bat","msi"]
  },
  "application/x-msmediaview": {
    "source": "apache",
    "extensions": ["mvb","m13","m14"]
  },
  "application/x-msmetafile": {
    "source": "apache",
    "extensions": ["wmf","wmz","emf","emz"]
  },
  "application/x-msmoney": {
    "source": "apache",
    "extensions": ["mny"]
  },
  "application/x-mspublisher": {
    "source": "apache",
    "extensions": ["pub"]
  },
  "application/x-msschedule": {
    "source": "apache",
    "extensions": ["scd"]
  },
  "application/x-msterminal": {
    "source": "apache",
    "extensions": ["trm"]
  },
  "application/x-mswrite": {
    "source": "apache",
    "extensions": ["wri"]
  },
  "application/x-netcdf": {
    "source": "apache",
    "extensions": ["nc","cdf"]
  },
  "application/x-ns-proxy-autoconfig": {
    "compressible": true,
    "extensions": ["pac"]
  },
  "application/x-nzb": {
    "source": "apache",
    "extensions": ["nzb"]
  },
  "application/x-perl": {
    "source": "nginx",
    "extensions": ["pl","pm"]
  },
  "application/x-pilot": {
    "source": "nginx",
    "extensions": ["prc","pdb"]
  },
  "application/x-pkcs12": {
    "source": "apache",
    "compressible": false,
    "extensions": ["p12","pfx"]
  },
  "application/x-pkcs7-certificates": {
    "source": "apache",
    "extensions": ["p7b","spc"]
  },
  "application/x-pkcs7-certreqresp": {
    "source": "apache",
    "extensions": ["p7r"]
  },
  "application/x-rar-compressed": {
    "source": "apache",
    "compressible": false,
    "extensions": ["rar"]
  },
  "application/x-redhat-package-manager": {
    "source": "nginx",
    "extensions": ["rpm"]
  },
  "application/x-research-info-systems": {
    "source": "apache",
    "extensions": ["ris"]
  },
  "application/x-sea": {
    "source": "nginx",
    "extensions": ["sea"]
  },
  "application/x-sh": {
    "source": "apache",
    "compressible": true,
    "extensions": ["sh"]
  },
  "application/x-shar": {
    "source": "apache",
    "extensions": ["shar"]
  },
  "application/x-shockwave-flash": {
    "source": "apache",
    "compressible": false,
    "extensions": ["swf"]
  },
  "application/x-silverlight-app": {
    "source": "apache",
    "extensions": ["xap"]
  },
  "application/x-sql": {
    "source": "apache",
    "extensions": ["sql"]
  },
  "application/x-stuffit": {
    "source": "apache",
    "compressible": false,
    "extensions": ["sit"]
  },
  "application/x-stuffitx": {
    "source": "apache",
    "extensions": ["sitx"]
  },
  "application/x-subrip": {
    "source": "apache",
    "extensions": ["srt"]
  },
  "application/x-sv4cpio": {
    "source": "apache",
    "extensions": ["sv4cpio"]
  },
  "application/x-sv4crc": {
    "source": "apache",
    "extensions": ["sv4crc"]
  },
  "application/x-t3vm-image": {
    "source": "apache",
    "extensions": ["t3"]
  },
  "application/x-tads": {
    "source": "apache",
    "extensions": ["gam"]
  },
  "application/x-tar": {
    "source": "apache",
    "compressible": true,
    "extensions": ["tar"]
  },
  "application/x-tcl": {
    "source": "apache",
    "extensions": ["tcl","tk"]
  },
  "application/x-tex": {
    "source": "apache",
    "extensions": ["tex"]
  },
  "application/x-tex-tfm": {
    "source": "apache",
    "extensions": ["tfm"]
  },
  "application/x-texinfo": {
    "source": "apache",
    "extensions": ["texinfo","texi"]
  },
  "application/x-tgif": {
    "source": "apache",
    "extensions": ["obj"]
  },
  "application/x-ustar": {
    "source": "apache",
    "extensions": ["ustar"]
  },
  "application/x-wais-source": {
    "source": "apache",
    "extensions": ["src"]
  },
  "application/x-web-app-manifest+json": {
    "compressible": true,
    "extensions": ["webapp"]
  },
  "application/x-www-form-urlencoded": {
    "source": "iana",
    "compressible": true
  },
  "application/x-x509-ca-cert": {
    "source": "apache",
    "extensions": ["der","crt","pem"]
  },
  "application/x-xfig": {
    "source": "apache",
    "extensions": ["fig"]
  },
  "application/x-xliff+xml": {
    "source": "apache",
    "extensions": ["xlf"]
  },
  "application/x-xpinstall": {
    "source": "apache",
    "compressible": false,
    "extensions": ["xpi"]
  },
  "application/x-xz": {
    "source": "apache",
    "extensions": ["xz"]
  },
  "application/x-zmachine": {
    "source": "apache",
    "extensions": ["z1","z2","z3","z4","z5","z6","z7","z8"]
  },
  "application/x400-bp": {
    "source": "iana"
  },
  "application/xacml+xml": {
    "source": "iana"
  },
  "application/xaml+xml": {
    "source": "apache",
    "extensions": ["xaml"]
  },
  "application/xcap-att+xml": {
    "source": "iana"
  },
  "application/xcap-caps+xml": {
    "source": "iana"
  },
  "application/xcap-diff+xml": {
    "source": "iana",
    "extensions": ["xdf"]
  },
  "application/xcap-el+xml": {
    "source": "iana"
  },
  "application/xcap-error+xml": {
    "source": "iana"
  },
  "application/xcap-ns+xml": {
    "source": "iana"
  },
  "application/xcon-conference-info+xml": {
    "source": "iana"
  },
  "application/xcon-conference-info-diff+xml": {
    "source": "iana"
  },
  "application/xenc+xml": {
    "source": "iana",
    "extensions": ["xenc"]
  },
  "application/xhtml+xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["xhtml","xht"]
  },
  "application/xhtml-voice+xml": {
    "source": "apache"
  },
  "application/xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["xml","xsl","xsd"]
  },
  "application/xml-dtd": {
    "source": "iana",
    "compressible": true,
    "extensions": ["dtd"]
  },
  "application/xml-external-parsed-entity": {
    "source": "iana"
  },
  "application/xml-patch+xml": {
    "source": "iana"
  },
  "application/xmpp+xml": {
    "source": "iana"
  },
  "application/xop+xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["xop"]
  },
  "application/xproc+xml": {
    "source": "apache",
    "extensions": ["xpl"]
  },
  "application/xslt+xml": {
    "source": "iana",
    "extensions": ["xslt"]
  },
  "application/xspf+xml": {
    "source": "apache",
    "extensions": ["xspf"]
  },
  "application/xv+xml": {
    "source": "iana",
    "extensions": ["mxml","xhvml","xvml","xvm"]
  },
  "application/yang": {
    "source": "iana",
    "extensions": ["yang"]
  },
  "application/yin+xml": {
    "source": "iana",
    "extensions": ["yin"]
  },
  "application/zip": {
    "source": "iana",
    "compressible": false,
    "extensions": ["zip"]
  },
  "application/zlib": {
    "source": "iana"
  },
  "audio/1d-interleaved-parityfec": {
    "source": "iana"
  },
  "audio/32kadpcm": {
    "source": "iana"
  },
  "audio/3gpp": {
    "source": "iana"
  },
  "audio/3gpp2": {
    "source": "iana"
  },
  "audio/ac3": {
    "source": "iana"
  },
  "audio/adpcm": {
    "source": "apache",
    "extensions": ["adp"]
  },
  "audio/amr": {
    "source": "iana"
  },
  "audio/amr-wb": {
    "source": "iana"
  },
  "audio/amr-wb+": {
    "source": "iana"
  },
  "audio/aptx": {
    "source": "iana"
  },
  "audio/asc": {
    "source": "iana"
  },
  "audio/atrac-advanced-lossless": {
    "source": "iana"
  },
  "audio/atrac-x": {
    "source": "iana"
  },
  "audio/atrac3": {
    "source": "iana"
  },
  "audio/basic": {
    "source": "iana",
    "compressible": false,
    "extensions": ["au","snd"]
  },
  "audio/bv16": {
    "source": "iana"
  },
  "audio/bv32": {
    "source": "iana"
  },
  "audio/clearmode": {
    "source": "iana"
  },
  "audio/cn": {
    "source": "iana"
  },
  "audio/dat12": {
    "source": "iana"
  },
  "audio/dls": {
    "source": "iana"
  },
  "audio/dsr-es201108": {
    "source": "iana"
  },
  "audio/dsr-es202050": {
    "source": "iana"
  },
  "audio/dsr-es202211": {
    "source": "iana"
  },
  "audio/dsr-es202212": {
    "source": "iana"
  },
  "audio/dv": {
    "source": "iana"
  },
  "audio/dvi4": {
    "source": "iana"
  },
  "audio/eac3": {
    "source": "iana"
  },
  "audio/encaprtp": {
    "source": "iana"
  },
  "audio/evrc": {
    "source": "iana"
  },
  "audio/evrc-qcp": {
    "source": "iana"
  },
  "audio/evrc0": {
    "source": "iana"
  },
  "audio/evrc1": {
    "source": "iana"
  },
  "audio/evrcb": {
    "source": "iana"
  },
  "audio/evrcb0": {
    "source": "iana"
  },
  "audio/evrcb1": {
    "source": "iana"
  },
  "audio/evrcnw": {
    "source": "iana"
  },
  "audio/evrcnw0": {
    "source": "iana"
  },
  "audio/evrcnw1": {
    "source": "iana"
  },
  "audio/evrcwb": {
    "source": "iana"
  },
  "audio/evrcwb0": {
    "source": "iana"
  },
  "audio/evrcwb1": {
    "source": "iana"
  },
  "audio/fwdred": {
    "source": "iana"
  },
  "audio/g719": {
    "source": "iana"
  },
  "audio/g722": {
    "source": "iana"
  },
  "audio/g7221": {
    "source": "iana"
  },
  "audio/g723": {
    "source": "iana"
  },
  "audio/g726-16": {
    "source": "iana"
  },
  "audio/g726-24": {
    "source": "iana"
  },
  "audio/g726-32": {
    "source": "iana"
  },
  "audio/g726-40": {
    "source": "iana"
  },
  "audio/g728": {
    "source": "iana"
  },
  "audio/g729": {
    "source": "iana"
  },
  "audio/g7291": {
    "source": "iana"
  },
  "audio/g729d": {
    "source": "iana"
  },
  "audio/g729e": {
    "source": "iana"
  },
  "audio/gsm": {
    "source": "iana"
  },
  "audio/gsm-efr": {
    "source": "iana"
  },
  "audio/gsm-hr-08": {
    "source": "iana"
  },
  "audio/ilbc": {
    "source": "iana"
  },
  "audio/ip-mr_v2.5": {
    "source": "iana"
  },
  "audio/isac": {
    "source": "apache"
  },
  "audio/l16": {
    "source": "iana"
  },
  "audio/l20": {
    "source": "iana"
  },
  "audio/l24": {
    "source": "iana",
    "compressible": false
  },
  "audio/l8": {
    "source": "iana"
  },
  "audio/lpc": {
    "source": "iana"
  },
  "audio/midi": {
    "source": "apache",
    "extensions": ["mid","midi","kar","rmi"]
  },
  "audio/mobile-xmf": {
    "source": "iana"
  },
  "audio/mp4": {
    "source": "iana",
    "compressible": false,
    "extensions": ["mp4a","m4a"]
  },
  "audio/mp4a-latm": {
    "source": "iana"
  },
  "audio/mpa": {
    "source": "iana"
  },
  "audio/mpa-robust": {
    "source": "iana"
  },
  "audio/mpeg": {
    "source": "iana",
    "compressible": false,
    "extensions": ["mpga","mp2","mp2a","mp3","m2a","m3a"]
  },
  "audio/mpeg4-generic": {
    "source": "iana"
  },
  "audio/musepack": {
    "source": "apache"
  },
  "audio/ogg": {
    "source": "iana",
    "compressible": false,
    "extensions": ["oga","ogg","spx"]
  },
  "audio/opus": {
    "source": "iana"
  },
  "audio/parityfec": {
    "source": "iana"
  },
  "audio/pcma": {
    "source": "iana"
  },
  "audio/pcma-wb": {
    "source": "iana"
  },
  "audio/pcmu": {
    "source": "iana"
  },
  "audio/pcmu-wb": {
    "source": "iana"
  },
  "audio/prs.sid": {
    "source": "iana"
  },
  "audio/qcelp": {
    "source": "iana"
  },
  "audio/raptorfec": {
    "source": "iana"
  },
  "audio/red": {
    "source": "iana"
  },
  "audio/rtp-enc-aescm128": {
    "source": "iana"
  },
  "audio/rtp-midi": {
    "source": "iana"
  },
  "audio/rtploopback": {
    "source": "iana"
  },
  "audio/rtx": {
    "source": "iana"
  },
  "audio/s3m": {
    "source": "apache",
    "extensions": ["s3m"]
  },
  "audio/silk": {
    "source": "apache",
    "extensions": ["sil"]
  },
  "audio/smv": {
    "source": "iana"
  },
  "audio/smv-qcp": {
    "source": "iana"
  },
  "audio/smv0": {
    "source": "iana"
  },
  "audio/sp-midi": {
    "source": "iana"
  },
  "audio/speex": {
    "source": "iana"
  },
  "audio/t140c": {
    "source": "iana"
  },
  "audio/t38": {
    "source": "iana"
  },
  "audio/telephone-event": {
    "source": "iana"
  },
  "audio/tone": {
    "source": "iana"
  },
  "audio/uemclip": {
    "source": "iana"
  },
  "audio/ulpfec": {
    "source": "iana"
  },
  "audio/vdvi": {
    "source": "iana"
  },
  "audio/vmr-wb": {
    "source": "iana"
  },
  "audio/vnd.3gpp.iufp": {
    "source": "iana"
  },
  "audio/vnd.4sb": {
    "source": "iana"
  },
  "audio/vnd.audiokoz": {
    "source": "iana"
  },
  "audio/vnd.celp": {
    "source": "iana"
  },
  "audio/vnd.cisco.nse": {
    "source": "iana"
  },
  "audio/vnd.cmles.radio-events": {
    "source": "iana"
  },
  "audio/vnd.cns.anp1": {
    "source": "iana"
  },
  "audio/vnd.cns.inf1": {
    "source": "iana"
  },
  "audio/vnd.dece.audio": {
    "source": "iana",
    "extensions": ["uva","uvva"]
  },
  "audio/vnd.digital-winds": {
    "source": "iana",
    "extensions": ["eol"]
  },
  "audio/vnd.dlna.adts": {
    "source": "iana"
  },
  "audio/vnd.dolby.heaac.1": {
    "source": "iana"
  },
  "audio/vnd.dolby.heaac.2": {
    "source": "iana"
  },
  "audio/vnd.dolby.mlp": {
    "source": "iana"
  },
  "audio/vnd.dolby.mps": {
    "source": "iana"
  },
  "audio/vnd.dolby.pl2": {
    "source": "iana"
  },
  "audio/vnd.dolby.pl2x": {
    "source": "iana"
  },
  "audio/vnd.dolby.pl2z": {
    "source": "iana"
  },
  "audio/vnd.dolby.pulse.1": {
    "source": "iana"
  },
  "audio/vnd.dra": {
    "source": "iana",
    "extensions": ["dra"]
  },
  "audio/vnd.dts": {
    "source": "iana",
    "extensions": ["dts"]
  },
  "audio/vnd.dts.hd": {
    "source": "iana",
    "extensions": ["dtshd"]
  },
  "audio/vnd.dvb.file": {
    "source": "iana"
  },
  "audio/vnd.everad.plj": {
    "source": "iana"
  },
  "audio/vnd.hns.audio": {
    "source": "iana"
  },
  "audio/vnd.lucent.voice": {
    "source": "iana",
    "extensions": ["lvp"]
  },
  "audio/vnd.ms-playready.media.pya": {
    "source": "iana",
    "extensions": ["pya"]
  },
  "audio/vnd.nokia.mobile-xmf": {
    "source": "iana"
  },
  "audio/vnd.nortel.vbk": {
    "source": "iana"
  },
  "audio/vnd.nuera.ecelp4800": {
    "source": "iana",
    "extensions": ["ecelp4800"]
  },
  "audio/vnd.nuera.ecelp7470": {
    "source": "iana",
    "extensions": ["ecelp7470"]
  },
  "audio/vnd.nuera.ecelp9600": {
    "source": "iana",
    "extensions": ["ecelp9600"]
  },
  "audio/vnd.octel.sbc": {
    "source": "iana"
  },
  "audio/vnd.qcelp": {
    "source": "iana"
  },
  "audio/vnd.rhetorex.32kadpcm": {
    "source": "iana"
  },
  "audio/vnd.rip": {
    "source": "iana",
    "extensions": ["rip"]
  },
  "audio/vnd.rn-realaudio": {
    "compressible": false
  },
  "audio/vnd.sealedmedia.softseal.mpeg": {
    "source": "iana"
  },
  "audio/vnd.vmx.cvsd": {
    "source": "iana"
  },
  "audio/vnd.wave": {
    "compressible": false
  },
  "audio/vorbis": {
    "source": "iana",
    "compressible": false
  },
  "audio/vorbis-config": {
    "source": "iana"
  },
  "audio/wav": {
    "compressible": false,
    "extensions": ["wav"]
  },
  "audio/wave": {
    "compressible": false,
    "extensions": ["wav"]
  },
  "audio/webm": {
    "source": "apache",
    "compressible": false,
    "extensions": ["weba"]
  },
  "audio/x-aac": {
    "source": "apache",
    "compressible": false,
    "extensions": ["aac"]
  },
  "audio/x-aiff": {
    "source": "apache",
    "extensions": ["aif","aiff","aifc"]
  },
  "audio/x-caf": {
    "source": "apache",
    "compressible": false,
    "extensions": ["caf"]
  },
  "audio/x-flac": {
    "source": "apache",
    "extensions": ["flac"]
  },
  "audio/x-m4a": {
    "source": "nginx",
    "extensions": ["m4a"]
  },
  "audio/x-matroska": {
    "source": "apache",
    "extensions": ["mka"]
  },
  "audio/x-mpegurl": {
    "source": "apache",
    "extensions": ["m3u"]
  },
  "audio/x-ms-wax": {
    "source": "apache",
    "extensions": ["wax"]
  },
  "audio/x-ms-wma": {
    "source": "apache",
    "extensions": ["wma"]
  },
  "audio/x-pn-realaudio": {
    "source": "apache",
    "extensions": ["ram","ra"]
  },
  "audio/x-pn-realaudio-plugin": {
    "source": "apache",
    "extensions": ["rmp"]
  },
  "audio/x-realaudio": {
    "source": "nginx",
    "extensions": ["ra"]
  },
  "audio/x-tta": {
    "source": "apache"
  },
  "audio/x-wav": {
    "source": "apache",
    "extensions": ["wav"]
  },
  "audio/xm": {
    "source": "apache",
    "extensions": ["xm"]
  },
  "chemical/x-cdx": {
    "source": "apache",
    "extensions": ["cdx"]
  },
  "chemical/x-cif": {
    "source": "apache",
    "extensions": ["cif"]
  },
  "chemical/x-cmdf": {
    "source": "apache",
    "extensions": ["cmdf"]
  },
  "chemical/x-cml": {
    "source": "apache",
    "extensions": ["cml"]
  },
  "chemical/x-csml": {
    "source": "apache",
    "extensions": ["csml"]
  },
  "chemical/x-pdb": {
    "source": "apache"
  },
  "chemical/x-xyz": {
    "source": "apache",
    "extensions": ["xyz"]
  },
  "font/opentype": {
    "compressible": true,
    "extensions": ["otf"]
  },
  "image/bmp": {
    "source": "apache",
    "compressible": true,
    "extensions": ["bmp"]
  },
  "image/cgm": {
    "source": "iana",
    "extensions": ["cgm"]
  },
  "image/fits": {
    "source": "iana"
  },
  "image/g3fax": {
    "source": "iana",
    "extensions": ["g3"]
  },
  "image/gif": {
    "source": "iana",
    "compressible": false,
    "extensions": ["gif"]
  },
  "image/ief": {
    "source": "iana",
    "extensions": ["ief"]
  },
  "image/jp2": {
    "source": "iana"
  },
  "image/jpeg": {
    "source": "iana",
    "compressible": false,
    "extensions": ["jpeg","jpg","jpe"]
  },
  "image/jpm": {
    "source": "iana"
  },
  "image/jpx": {
    "source": "iana"
  },
  "image/ktx": {
    "source": "iana",
    "extensions": ["ktx"]
  },
  "image/naplps": {
    "source": "iana"
  },
  "image/pjpeg": {
    "compressible": false
  },
  "image/png": {
    "source": "iana",
    "compressible": false,
    "extensions": ["png"]
  },
  "image/prs.btif": {
    "source": "iana",
    "extensions": ["btif"]
  },
  "image/prs.pti": {
    "source": "iana"
  },
  "image/pwg-raster": {
    "source": "iana"
  },
  "image/sgi": {
    "source": "apache",
    "extensions": ["sgi"]
  },
  "image/svg+xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["svg","svgz"]
  },
  "image/t38": {
    "source": "iana"
  },
  "image/tiff": {
    "source": "iana",
    "compressible": false,
    "extensions": ["tiff","tif"]
  },
  "image/tiff-fx": {
    "source": "iana"
  },
  "image/vnd.adobe.photoshop": {
    "source": "iana",
    "compressible": true,
    "extensions": ["psd"]
  },
  "image/vnd.airzip.accelerator.azv": {
    "source": "iana"
  },
  "image/vnd.cns.inf2": {
    "source": "iana"
  },
  "image/vnd.dece.graphic": {
    "source": "iana",
    "extensions": ["uvi","uvvi","uvg","uvvg"]
  },
  "image/vnd.djvu": {
    "source": "iana",
    "extensions": ["djvu","djv"]
  },
  "image/vnd.dvb.subtitle": {
    "source": "iana",
    "extensions": ["sub"]
  },
  "image/vnd.dwg": {
    "source": "iana",
    "extensions": ["dwg"]
  },
  "image/vnd.dxf": {
    "source": "iana",
    "extensions": ["dxf"]
  },
  "image/vnd.fastbidsheet": {
    "source": "iana",
    "extensions": ["fbs"]
  },
  "image/vnd.fpx": {
    "source": "iana",
    "extensions": ["fpx"]
  },
  "image/vnd.fst": {
    "source": "iana",
    "extensions": ["fst"]
  },
  "image/vnd.fujixerox.edmics-mmr": {
    "source": "iana",
    "extensions": ["mmr"]
  },
  "image/vnd.fujixerox.edmics-rlc": {
    "source": "iana",
    "extensions": ["rlc"]
  },
  "image/vnd.globalgraphics.pgb": {
    "source": "iana"
  },
  "image/vnd.microsoft.icon": {
    "source": "iana"
  },
  "image/vnd.mix": {
    "source": "iana"
  },
  "image/vnd.ms-modi": {
    "source": "iana",
    "extensions": ["mdi"]
  },
  "image/vnd.ms-photo": {
    "source": "apache",
    "extensions": ["wdp"]
  },
  "image/vnd.net-fpx": {
    "source": "iana",
    "extensions": ["npx"]
  },
  "image/vnd.radiance": {
    "source": "iana"
  },
  "image/vnd.sealed.png": {
    "source": "iana"
  },
  "image/vnd.sealedmedia.softseal.gif": {
    "source": "iana"
  },
  "image/vnd.sealedmedia.softseal.jpg": {
    "source": "iana"
  },
  "image/vnd.svf": {
    "source": "iana"
  },
  "image/vnd.tencent.tap": {
    "source": "iana"
  },
  "image/vnd.valve.source.texture": {
    "source": "iana"
  },
  "image/vnd.wap.wbmp": {
    "source": "iana",
    "extensions": ["wbmp"]
  },
  "image/vnd.xiff": {
    "source": "iana",
    "extensions": ["xif"]
  },
  "image/vnd.zbrush.pcx": {
    "source": "iana"
  },
  "image/webp": {
    "source": "apache",
    "extensions": ["webp"]
  },
  "image/x-3ds": {
    "source": "apache",
    "extensions": ["3ds"]
  },
  "image/x-cmu-raster": {
    "source": "apache",
    "extensions": ["ras"]
  },
  "image/x-cmx": {
    "source": "apache",
    "extensions": ["cmx"]
  },
  "image/x-freehand": {
    "source": "apache",
    "extensions": ["fh","fhc","fh4","fh5","fh7"]
  },
  "image/x-icon": {
    "source": "apache",
    "compressible": true,
    "extensions": ["ico"]
  },
  "image/x-jng": {
    "source": "nginx",
    "extensions": ["jng"]
  },
  "image/x-mrsid-image": {
    "source": "apache",
    "extensions": ["sid"]
  },
  "image/x-ms-bmp": {
    "source": "nginx",
    "compressible": true,
    "extensions": ["bmp"]
  },
  "image/x-pcx": {
    "source": "apache",
    "extensions": ["pcx"]
  },
  "image/x-pict": {
    "source": "apache",
    "extensions": ["pic","pct"]
  },
  "image/x-portable-anymap": {
    "source": "apache",
    "extensions": ["pnm"]
  },
  "image/x-portable-bitmap": {
    "source": "apache",
    "extensions": ["pbm"]
  },
  "image/x-portable-graymap": {
    "source": "apache",
    "extensions": ["pgm"]
  },
  "image/x-portable-pixmap": {
    "source": "apache",
    "extensions": ["ppm"]
  },
  "image/x-rgb": {
    "source": "apache",
    "extensions": ["rgb"]
  },
  "image/x-tga": {
    "source": "apache",
    "extensions": ["tga"]
  },
  "image/x-xbitmap": {
    "source": "apache",
    "extensions": ["xbm"]
  },
  "image/x-xcf": {
    "compressible": false
  },
  "image/x-xpixmap": {
    "source": "apache",
    "extensions": ["xpm"]
  },
  "image/x-xwindowdump": {
    "source": "apache",
    "extensions": ["xwd"]
  },
  "message/cpim": {
    "source": "iana"
  },
  "message/delivery-status": {
    "source": "iana"
  },
  "message/disposition-notification": {
    "source": "iana"
  },
  "message/external-body": {
    "source": "iana"
  },
  "message/feedback-report": {
    "source": "iana"
  },
  "message/global": {
    "source": "iana"
  },
  "message/global-delivery-status": {
    "source": "iana"
  },
  "message/global-disposition-notification": {
    "source": "iana"
  },
  "message/global-headers": {
    "source": "iana"
  },
  "message/http": {
    "source": "iana",
    "compressible": false
  },
  "message/imdn+xml": {
    "source": "iana",
    "compressible": true
  },
  "message/news": {
    "source": "iana"
  },
  "message/partial": {
    "source": "iana",
    "compressible": false
  },
  "message/rfc822": {
    "source": "iana",
    "compressible": true,
    "extensions": ["eml","mime"]
  },
  "message/s-http": {
    "source": "iana"
  },
  "message/sip": {
    "source": "iana"
  },
  "message/sipfrag": {
    "source": "iana"
  },
  "message/tracking-status": {
    "source": "iana"
  },
  "message/vnd.si.simp": {
    "source": "iana"
  },
  "message/vnd.wfa.wsc": {
    "source": "iana"
  },
  "model/iges": {
    "source": "iana",
    "compressible": false,
    "extensions": ["igs","iges"]
  },
  "model/mesh": {
    "source": "iana",
    "compressible": false,
    "extensions": ["msh","mesh","silo"]
  },
  "model/vnd.collada+xml": {
    "source": "iana",
    "extensions": ["dae"]
  },
  "model/vnd.dwf": {
    "source": "iana",
    "extensions": ["dwf"]
  },
  "model/vnd.flatland.3dml": {
    "source": "iana"
  },
  "model/vnd.gdl": {
    "source": "iana",
    "extensions": ["gdl"]
  },
  "model/vnd.gs-gdl": {
    "source": "apache"
  },
  "model/vnd.gs.gdl": {
    "source": "iana"
  },
  "model/vnd.gtw": {
    "source": "iana",
    "extensions": ["gtw"]
  },
  "model/vnd.moml+xml": {
    "source": "iana"
  },
  "model/vnd.mts": {
    "source": "iana",
    "extensions": ["mts"]
  },
  "model/vnd.opengex": {
    "source": "iana"
  },
  "model/vnd.parasolid.transmit.binary": {
    "source": "iana"
  },
  "model/vnd.parasolid.transmit.text": {
    "source": "iana"
  },
  "model/vnd.valve.source.compiled-map": {
    "source": "iana"
  },
  "model/vnd.vtu": {
    "source": "iana",
    "extensions": ["vtu"]
  },
  "model/vrml": {
    "source": "iana",
    "compressible": false,
    "extensions": ["wrl","vrml"]
  },
  "model/x3d+binary": {
    "source": "apache",
    "compressible": false,
    "extensions": ["x3db","x3dbz"]
  },
  "model/x3d+fastinfoset": {
    "source": "iana"
  },
  "model/x3d+vrml": {
    "source": "apache",
    "compressible": false,
    "extensions": ["x3dv","x3dvz"]
  },
  "model/x3d+xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["x3d","x3dz"]
  },
  "model/x3d-vrml": {
    "source": "iana"
  },
  "multipart/alternative": {
    "source": "iana",
    "compressible": false
  },
  "multipart/appledouble": {
    "source": "iana"
  },
  "multipart/byteranges": {
    "source": "iana"
  },
  "multipart/digest": {
    "source": "iana"
  },
  "multipart/encrypted": {
    "source": "iana",
    "compressible": false
  },
  "multipart/form-data": {
    "source": "iana",
    "compressible": false
  },
  "multipart/header-set": {
    "source": "iana"
  },
  "multipart/mixed": {
    "source": "iana",
    "compressible": false
  },
  "multipart/parallel": {
    "source": "iana"
  },
  "multipart/related": {
    "source": "iana",
    "compressible": false
  },
  "multipart/report": {
    "source": "iana"
  },
  "multipart/signed": {
    "source": "iana",
    "compressible": false
  },
  "multipart/voice-message": {
    "source": "iana"
  },
  "multipart/x-mixed-replace": {
    "source": "iana"
  },
  "text/1d-interleaved-parityfec": {
    "source": "iana"
  },
  "text/cache-manifest": {
    "source": "iana",
    "compressible": true,
    "extensions": ["appcache","manifest"]
  },
  "text/calendar": {
    "source": "iana",
    "extensions": ["ics","ifb"]
  },
  "text/calender": {
    "compressible": true
  },
  "text/cmd": {
    "compressible": true
  },
  "text/coffeescript": {
    "extensions": ["coffee","litcoffee"]
  },
  "text/css": {
    "source": "iana",
    "compressible": true,
    "extensions": ["css"]
  },
  "text/csv": {
    "source": "iana",
    "compressible": true,
    "extensions": ["csv"]
  },
  "text/csv-schema": {
    "source": "iana"
  },
  "text/directory": {
    "source": "iana"
  },
  "text/dns": {
    "source": "iana"
  },
  "text/ecmascript": {
    "source": "iana"
  },
  "text/encaprtp": {
    "source": "iana"
  },
  "text/enriched": {
    "source": "iana"
  },
  "text/fwdred": {
    "source": "iana"
  },
  "text/grammar-ref-list": {
    "source": "iana"
  },
  "text/hjson": {
    "extensions": ["hjson"]
  },
  "text/html": {
    "source": "iana",
    "compressible": true,
    "extensions": ["html","htm","shtml"]
  },
  "text/jade": {
    "extensions": ["jade"]
  },
  "text/javascript": {
    "source": "iana",
    "compressible": true
  },
  "text/jcr-cnd": {
    "source": "iana"
  },
  "text/jsx": {
    "compressible": true,
    "extensions": ["jsx"]
  },
  "text/less": {
    "extensions": ["less"]
  },
  "text/markdown": {
    "source": "iana"
  },
  "text/mathml": {
    "source": "nginx",
    "extensions": ["mml"]
  },
  "text/mizar": {
    "source": "iana"
  },
  "text/n3": {
    "source": "iana",
    "compressible": true,
    "extensions": ["n3"]
  },
  "text/parameters": {
    "source": "iana"
  },
  "text/parityfec": {
    "source": "iana"
  },
  "text/plain": {
    "source": "iana",
    "compressible": true,
    "extensions": ["txt","text","conf","def","list","log","in","ini"]
  },
  "text/provenance-notation": {
    "source": "iana"
  },
  "text/prs.fallenstein.rst": {
    "source": "iana"
  },
  "text/prs.lines.tag": {
    "source": "iana",
    "extensions": ["dsc"]
  },
  "text/raptorfec": {
    "source": "iana"
  },
  "text/red": {
    "source": "iana"
  },
  "text/rfc822-headers": {
    "source": "iana"
  },
  "text/richtext": {
    "source": "iana",
    "compressible": true,
    "extensions": ["rtx"]
  },
  "text/rtf": {
    "source": "iana",
    "compressible": true,
    "extensions": ["rtf"]
  },
  "text/rtp-enc-aescm128": {
    "source": "iana"
  },
  "text/rtploopback": {
    "source": "iana"
  },
  "text/rtx": {
    "source": "iana"
  },
  "text/sgml": {
    "source": "iana",
    "extensions": ["sgml","sgm"]
  },
  "text/stylus": {
    "extensions": ["stylus","styl"]
  },
  "text/t140": {
    "source": "iana"
  },
  "text/tab-separated-values": {
    "source": "iana",
    "compressible": true,
    "extensions": ["tsv"]
  },
  "text/troff": {
    "source": "iana",
    "extensions": ["t","tr","roff","man","me","ms"]
  },
  "text/turtle": {
    "source": "iana",
    "extensions": ["ttl"]
  },
  "text/ulpfec": {
    "source": "iana"
  },
  "text/uri-list": {
    "source": "iana",
    "compressible": true,
    "extensions": ["uri","uris","urls"]
  },
  "text/vcard": {
    "source": "iana",
    "compressible": true,
    "extensions": ["vcard"]
  },
  "text/vnd.a": {
    "source": "iana"
  },
  "text/vnd.abc": {
    "source": "iana"
  },
  "text/vnd.curl": {
    "source": "iana",
    "extensions": ["curl"]
  },
  "text/vnd.curl.dcurl": {
    "source": "apache",
    "extensions": ["dcurl"]
  },
  "text/vnd.curl.mcurl": {
    "source": "apache",
    "extensions": ["mcurl"]
  },
  "text/vnd.curl.scurl": {
    "source": "apache",
    "extensions": ["scurl"]
  },
  "text/vnd.debian.copyright": {
    "source": "iana"
  },
  "text/vnd.dmclientscript": {
    "source": "iana"
  },
  "text/vnd.dvb.subtitle": {
    "source": "iana",
    "extensions": ["sub"]
  },
  "text/vnd.esmertec.theme-descriptor": {
    "source": "iana"
  },
  "text/vnd.fly": {
    "source": "iana",
    "extensions": ["fly"]
  },
  "text/vnd.fmi.flexstor": {
    "source": "iana",
    "extensions": ["flx"]
  },
  "text/vnd.graphviz": {
    "source": "iana",
    "extensions": ["gv"]
  },
  "text/vnd.in3d.3dml": {
    "source": "iana",
    "extensions": ["3dml"]
  },
  "text/vnd.in3d.spot": {
    "source": "iana",
    "extensions": ["spot"]
  },
  "text/vnd.iptc.newsml": {
    "source": "iana"
  },
  "text/vnd.iptc.nitf": {
    "source": "iana"
  },
  "text/vnd.latex-z": {
    "source": "iana"
  },
  "text/vnd.motorola.reflex": {
    "source": "iana"
  },
  "text/vnd.ms-mediapackage": {
    "source": "iana"
  },
  "text/vnd.net2phone.commcenter.command": {
    "source": "iana"
  },
  "text/vnd.radisys.msml-basic-layout": {
    "source": "iana"
  },
  "text/vnd.si.uricatalogue": {
    "source": "iana"
  },
  "text/vnd.sun.j2me.app-descriptor": {
    "source": "iana",
    "extensions": ["jad"]
  },
  "text/vnd.trolltech.linguist": {
    "source": "iana"
  },
  "text/vnd.wap.si": {
    "source": "iana"
  },
  "text/vnd.wap.sl": {
    "source": "iana"
  },
  "text/vnd.wap.wml": {
    "source": "iana",
    "extensions": ["wml"]
  },
  "text/vnd.wap.wmlscript": {
    "source": "iana",
    "extensions": ["wmls"]
  },
  "text/vtt": {
    "charset": "UTF-8",
    "compressible": true,
    "extensions": ["vtt"]
  },
  "text/x-asm": {
    "source": "apache",
    "extensions": ["s","asm"]
  },
  "text/x-c": {
    "source": "apache",
    "extensions": ["c","cc","cxx","cpp","h","hh","dic"]
  },
  "text/x-component": {
    "source": "nginx",
    "extensions": ["htc"]
  },
  "text/x-fortran": {
    "source": "apache",
    "extensions": ["f","for","f77","f90"]
  },
  "text/x-gwt-rpc": {
    "compressible": true
  },
  "text/x-handlebars-template": {
    "extensions": ["hbs"]
  },
  "text/x-java-source": {
    "source": "apache",
    "extensions": ["java"]
  },
  "text/x-jquery-tmpl": {
    "compressible": true
  },
  "text/x-lua": {
    "extensions": ["lua"]
  },
  "text/x-markdown": {
    "compressible": true,
    "extensions": ["markdown","md","mkd"]
  },
  "text/x-nfo": {
    "source": "apache",
    "extensions": ["nfo"]
  },
  "text/x-opml": {
    "source": "apache",
    "extensions": ["opml"]
  },
  "text/x-pascal": {
    "source": "apache",
    "extensions": ["p","pas"]
  },
  "text/x-processing": {
    "compressible": true,
    "extensions": ["pde"]
  },
  "text/x-sass": {
    "extensions": ["sass"]
  },
  "text/x-scss": {
    "extensions": ["scss"]
  },
  "text/x-setext": {
    "source": "apache",
    "extensions": ["etx"]
  },
  "text/x-sfv": {
    "source": "apache",
    "extensions": ["sfv"]
  },
  "text/x-uuencode": {
    "source": "apache",
    "extensions": ["uu"]
  },
  "text/x-vcalendar": {
    "source": "apache",
    "extensions": ["vcs"]
  },
  "text/x-vcard": {
    "source": "apache",
    "extensions": ["vcf"]
  },
  "text/xml": {
    "source": "iana",
    "compressible": true,
    "extensions": ["xml"]
  },
  "text/xml-external-parsed-entity": {
    "source": "iana"
  },
  "text/yaml": {
    "extensions": ["yaml","yml"]
  },
  "video/1d-interleaved-parityfec": {
    "source": "apache"
  },
  "video/3gpp": {
    "source": "apache",
    "extensions": ["3gp","3gpp"]
  },
  "video/3gpp-tt": {
    "source": "apache"
  },
  "video/3gpp2": {
    "source": "apache",
    "extensions": ["3g2"]
  },
  "video/bmpeg": {
    "source": "apache"
  },
  "video/bt656": {
    "source": "apache"
  },
  "video/celb": {
    "source": "apache"
  },
  "video/dv": {
    "source": "apache"
  },
  "video/h261": {
    "source": "apache",
    "extensions": ["h261"]
  },
  "video/h263": {
    "source": "apache",
    "extensions": ["h263"]
  },
  "video/h263-1998": {
    "source": "apache"
  },
  "video/h263-2000": {
    "source": "apache"
  },
  "video/h264": {
    "source": "apache",
    "extensions": ["h264"]
  },
  "video/h264-rcdo": {
    "source": "apache"
  },
  "video/h264-svc": {
    "source": "apache"
  },
  "video/jpeg": {
    "source": "apache",
    "extensions": ["jpgv"]
  },
  "video/jpeg2000": {
    "source": "apache"
  },
  "video/jpm": {
    "source": "apache",
    "extensions": ["jpm","jpgm"]
  },
  "video/mj2": {
    "source": "apache",
    "extensions": ["mj2","mjp2"]
  },
  "video/mp1s": {
    "source": "apache"
  },
  "video/mp2p": {
    "source": "apache"
  },
  "video/mp2t": {
    "source": "apache",
    "extensions": ["ts"]
  },
  "video/mp4": {
    "source": "apache",
    "compressible": false,
    "extensions": ["mp4","mp4v","mpg4"]
  },
  "video/mp4v-es": {
    "source": "apache"
  },
  "video/mpeg": {
    "source": "apache",
    "compressible": false,
    "extensions": ["mpeg","mpg","mpe","m1v","m2v"]
  },
  "video/mpeg4-generic": {
    "source": "apache"
  },
  "video/mpv": {
    "source": "apache"
  },
  "video/nv": {
    "source": "apache"
  },
  "video/ogg": {
    "source": "apache",
    "compressible": false,
    "extensions": ["ogv"]
  },
  "video/parityfec": {
    "source": "apache"
  },
  "video/pointer": {
    "source": "apache"
  },
  "video/quicktime": {
    "source": "apache",
    "compressible": false,
    "extensions": ["qt","mov"]
  },
  "video/raw": {
    "source": "apache"
  },
  "video/rtp-enc-aescm128": {
    "source": "apache"
  },
  "video/rtx": {
    "source": "apache"
  },
  "video/smpte292m": {
    "source": "apache"
  },
  "video/ulpfec": {
    "source": "apache"
  },
  "video/vc1": {
    "source": "apache"
  },
  "video/vnd.cctv": {
    "source": "apache"
  },
  "video/vnd.dece.hd": {
    "source": "apache",
    "extensions": ["uvh","uvvh"]
  },
  "video/vnd.dece.mobile": {
    "source": "apache",
    "extensions": ["uvm","uvvm"]
  },
  "video/vnd.dece.mp4": {
    "source": "apache"
  },
  "video/vnd.dece.pd": {
    "source": "apache",
    "extensions": ["uvp","uvvp"]
  },
  "video/vnd.dece.sd": {
    "source": "apache",
    "extensions": ["uvs","uvvs"]
  },
  "video/vnd.dece.video": {
    "source": "apache",
    "extensions": ["uvv","uvvv"]
  },
  "video/vnd.directv.mpeg": {
    "source": "apache"
  },
  "video/vnd.directv.mpeg-tts": {
    "source": "apache"
  },
  "video/vnd.dlna.mpeg-tts": {
    "source": "apache"
  },
  "video/vnd.dvb.file": {
    "source": "apache",
    "extensions": ["dvb"]
  },
  "video/vnd.fvt": {
    "source": "apache",
    "extensions": ["fvt"]
  },
  "video/vnd.hns.video": {
    "source": "apache"
  },
  "video/vnd.iptvforum.1dparityfec-1010": {
    "source": "apache"
  },
  "video/vnd.iptvforum.1dparityfec-2005": {
    "source": "apache"
  },
  "video/vnd.iptvforum.2dparityfec-1010": {
    "source": "apache"
  },
  "video/vnd.iptvforum.2dparityfec-2005": {
    "source": "apache"
  },
  "video/vnd.iptvforum.ttsavc": {
    "source": "apache"
  },
  "video/vnd.iptvforum.ttsmpeg2": {
    "source": "apache"
  },
  "video/vnd.motorola.video": {
    "source": "apache"
  },
  "video/vnd.motorola.videop": {
    "source": "apache"
  },
  "video/vnd.mpegurl": {
    "source": "apache",
    "extensions": ["mxu","m4u"]
  },
  "video/vnd.ms-playready.media.pyv": {
    "source": "apache",
    "extensions": ["pyv"]
  },
  "video/vnd.nokia.interleaved-multimedia": {
    "source": "apache"
  },
  "video/vnd.nokia.videovoip": {
    "source": "apache"
  },
  "video/vnd.objectvideo": {
    "source": "apache"
  },
  "video/vnd.sealed.mpeg1": {
    "source": "apache"
  },
  "video/vnd.sealed.mpeg4": {
    "source": "apache"
  },
  "video/vnd.sealed.swf": {
    "source": "apache"
  },
  "video/vnd.sealedmedia.softseal.mov": {
    "source": "apache"
  },
  "video/vnd.uvvu.mp4": {
    "source": "apache",
    "extensions": ["uvu","uvvu"]
  },
  "video/vnd.vivo": {
    "source": "apache",
    "extensions": ["viv"]
  },
  "video/webm": {
    "source": "apache",
    "compressible": false,
    "extensions": ["webm"]
  },
  "video/x-f4v": {
    "source": "apache",
    "extensions": ["f4v"]
  },
  "video/x-fli": {
    "source": "apache",
    "extensions": ["fli"]
  },
  "video/x-flv": {
    "source": "apache",
    "compressible": false,
    "extensions": ["flv"]
  },
  "video/x-m4v": {
    "source": "apache",
    "extensions": ["m4v"]
  },
  "video/x-matroska": {
    "source": "apache",
    "compressible": false,
    "extensions": ["mkv","mk3d","mks"]
  },
  "video/x-mng": {
    "source": "apache",
    "extensions": ["mng"]
  },
  "video/x-ms-asf": {
    "source": "apache",
    "extensions": ["asf","asx"]
  },
  "video/x-ms-vob": {
    "source": "apache",
    "extensions": ["vob"]
  },
  "video/x-ms-wm": {
    "source": "apache",
    "extensions": ["wm"]
  },
  "video/x-ms-wmv": {
    "source": "apache",
    "compressible": false,
    "extensions": ["wmv"]
  },
  "video/x-ms-wmx": {
    "source": "apache",
    "extensions": ["wmx"]
  },
  "video/x-ms-wvx": {
    "source": "apache",
    "extensions": ["wvx"]
  },
  "video/x-msvideo": {
    "source": "apache",
    "extensions": ["avi"]
  },
  "video/x-sgi-movie": {
    "source": "apache",
    "extensions": ["movie"]
  },
  "video/x-smv": {
    "source": "apache",
    "extensions": ["smv"]
  },
  "x-conference/x-cooltalk": {
    "source": "apache",
    "extensions": ["ice"]
  },
  "x-shader/x-fragment": {
    "compressible": true
  },
  "x-shader/x-vertex": {
    "compressible": true
  }
}

},{}],95:[function(require,module,exports){
/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * MIT Licensed
 */

/**
 * Module exports.
 */

module.exports = require('./db.json')

},{"./db.json":94}],96:[function(require,module,exports){
//     uuid.js
//
//     Copyright (c) 2010-2012 Robert Kieffer
//     MIT License - http://opensource.org/licenses/mit-license.php

(function() {
  var _global = this;

  // Unique ID creation requires a high quality random # generator.  We feature
  // detect to determine the best RNG source, normalizing to a function that
  // returns 128-bits of randomness, since that's what's usually required
  var _rng;

  // Node.js crypto-based RNG - http://nodejs.org/docs/v0.6.2/api/crypto.html
  //
  // Moderately fast, high quality
  if (typeof(_global.require) == 'function') {
    try {
      var _rb = _global.require('crypto').randomBytes;
      _rng = _rb && function() {return _rb(16);};
    } catch(e) {}
  }

  if (!_rng && _global.crypto && crypto.getRandomValues) {
    // WHATWG crypto-based RNG - http://wiki.whatwg.org/wiki/Crypto
    //
    // Moderately fast, high quality
    var _rnds8 = new Uint8Array(16);
    _rng = function whatwgRNG() {
      crypto.getRandomValues(_rnds8);
      return _rnds8;
    };
  }

  if (!_rng) {
    // Math.random()-based (RNG)
    //
    // If all else fails, use Math.random().  It's fast, but is of unspecified
    // quality.
    var  _rnds = new Array(16);
    _rng = function() {
      for (var i = 0, r; i < 16; i++) {
        if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
        _rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
      }

      return _rnds;
    };
  }

  // Buffer class to use
  var BufferClass = typeof(_global.Buffer) == 'function' ? _global.Buffer : Array;

  // Maps for number <-> hex string conversion
  var _byteToHex = [];
  var _hexToByte = {};
  for (var i = 0; i < 256; i++) {
    _byteToHex[i] = (i + 0x100).toString(16).substr(1);
    _hexToByte[_byteToHex[i]] = i;
  }

  // **`parse()` - Parse a UUID into it's component bytes**
  function parse(s, buf, offset) {
    var i = (buf && offset) || 0, ii = 0;

    buf = buf || [];
    s.toLowerCase().replace(/[0-9a-f]{2}/g, function(oct) {
      if (ii < 16) { // Don't overflow!
        buf[i + ii++] = _hexToByte[oct];
      }
    });

    // Zero out remaining bytes if string was short
    while (ii < 16) {
      buf[i + ii++] = 0;
    }

    return buf;
  }

  // **`unparse()` - Convert UUID byte array (ala parse()) into a string**
  function unparse(buf, offset) {
    var i = offset || 0, bth = _byteToHex;
    return  bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]];
  }

  // **`v1()` - Generate time-based UUID**
  //
  // Inspired by https://github.com/LiosK/UUID.js
  // and http://docs.python.org/library/uuid.html

  // random #'s we need to init node and clockseq
  var _seedBytes = _rng();

  // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
  var _nodeId = [
    _seedBytes[0] | 0x01,
    _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]
  ];

  // Per 4.2.2, randomize (14 bit) clockseq
  var _clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;

  // Previous uuid creation time
  var _lastMSecs = 0, _lastNSecs = 0;

  // See https://github.com/broofa/node-uuid for API details
  function v1(options, buf, offset) {
    var i = buf && offset || 0;
    var b = buf || [];

    options = options || {};

    var clockseq = options.clockseq != null ? options.clockseq : _clockseq;

    // UUID timestamps are 100 nano-second units since the Gregorian epoch,
    // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
    // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
    // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
    var msecs = options.msecs != null ? options.msecs : new Date().getTime();

    // Per 4.2.1.2, use count of uuid's generated during the current clock
    // cycle to simulate higher resolution clock
    var nsecs = options.nsecs != null ? options.nsecs : _lastNSecs + 1;

    // Time since last uuid creation (in msecs)
    var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

    // Per 4.2.1.2, Bump clockseq on clock regression
    if (dt < 0 && options.clockseq == null) {
      clockseq = clockseq + 1 & 0x3fff;
    }

    // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
    // time interval
    if ((dt < 0 || msecs > _lastMSecs) && options.nsecs == null) {
      nsecs = 0;
    }

    // Per 4.2.1.2 Throw error if too many uuids are requested
    if (nsecs >= 10000) {
      throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
    }

    _lastMSecs = msecs;
    _lastNSecs = nsecs;
    _clockseq = clockseq;

    // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
    msecs += 12219292800000;

    // `time_low`
    var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
    b[i++] = tl >>> 24 & 0xff;
    b[i++] = tl >>> 16 & 0xff;
    b[i++] = tl >>> 8 & 0xff;
    b[i++] = tl & 0xff;

    // `time_mid`
    var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
    b[i++] = tmh >>> 8 & 0xff;
    b[i++] = tmh & 0xff;

    // `time_high_and_version`
    b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
    b[i++] = tmh >>> 16 & 0xff;

    // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
    b[i++] = clockseq >>> 8 | 0x80;

    // `clock_seq_low`
    b[i++] = clockseq & 0xff;

    // `node`
    var node = options.node || _nodeId;
    for (var n = 0; n < 6; n++) {
      b[i + n] = node[n];
    }

    return buf ? buf : unparse(b);
  }

  // **`v4()` - Generate random UUID**

  // See https://github.com/broofa/node-uuid for API details
  function v4(options, buf, offset) {
    // Deprecated - 'format' argument, as supported in v1.2
    var i = buf && offset || 0;

    if (typeof(options) == 'string') {
      buf = options == 'binary' ? new BufferClass(16) : null;
      options = null;
    }
    options = options || {};

    var rnds = options.random || (options.rng || _rng)();

    // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;

    // Copy bytes to buffer, if provided
    if (buf) {
      for (var ii = 0; ii < 16; ii++) {
        buf[i + ii] = rnds[ii];
      }
    }

    return buf || unparse(rnds);
  }

  // Export public API
  var uuid = v4;
  uuid.v1 = v1;
  uuid.v4 = v4;
  uuid.parse = parse;
  uuid.unparse = unparse;
  uuid.BufferClass = BufferClass;

  if (typeof(module) != 'undefined' && module.exports) {
    // Publish as node.js module
    module.exports = uuid;
  } else  if (typeof define === 'function' && define.amd) {
    // Publish as AMD module
    define(function() {return uuid;});
 

  } else {
    // Publish as global (in browsers)
    var _previousRoot = _global.uuid;

    // **`noConflict()` - (browser only) to reset global 'uuid' var**
    uuid.noConflict = function() {
      _global.uuid = _previousRoot;
      return uuid;
    };

    _global.uuid = uuid;
  }
}).call(this);

},{}],97:[function(require,module,exports){
var crypto = require('crypto')
  , qs = require('querystring')
  ;

function sha1 (key, body) {
  return crypto.createHmac('sha1', key).update(body).digest('base64')
}

function rsa (key, body) {
  return crypto.createSign("RSA-SHA1").update(body).sign(key, 'base64');
}

function rfc3986 (str) {
  return encodeURIComponent(str)
    .replace(/!/g,'%21')
    .replace(/\*/g,'%2A')
    .replace(/\(/g,'%28')
    .replace(/\)/g,'%29')
    .replace(/'/g,'%27')
    ;
}

// Maps object to bi-dimensional array
// Converts { foo: 'A', bar: [ 'b', 'B' ]} to
// [ ['foo', 'A'], ['bar', 'b'], ['bar', 'B'] ]
function map (obj) {
  var key, val, arr = []
  for (key in obj) {
    val = obj[key]
    if (Array.isArray(val))
      for (var i = 0; i < val.length; i++)
        arr.push([key, val[i]])
    else if (typeof val === "object")
      for (var prop in val)
        arr.push([key + '[' + prop + ']', val[prop]]);
    else
      arr.push([key, val])
  }
  return arr
}

// Compare function for sort
function compare (a, b) {
  return a > b ? 1 : a < b ? -1 : 0
}

function generateBase (httpMethod, base_uri, params) {
  // adapted from https://dev.twitter.com/docs/auth/oauth and 
  // https://dev.twitter.com/docs/auth/creating-signature

  // Parameter normalization
  // http://tools.ietf.org/html/rfc5849#section-3.4.1.3.2
  var normalized = map(params)
  // 1.  First, the name and value of each parameter are encoded
  .map(function (p) {
    return [ rfc3986(p[0]), rfc3986(p[1] || '') ]
  })
  // 2.  The parameters are sorted by name, using ascending byte value
  //     ordering.  If two or more parameters share the same name, they
  //     are sorted by their value.
  .sort(function (a, b) {
    return compare(a[0], b[0]) || compare(a[1], b[1])
  })
  // 3.  The name of each parameter is concatenated to its corresponding
  //     value using an "=" character (ASCII code 61) as a separator, even
  //     if the value is empty.
  .map(function (p) { return p.join('=') })
   // 4.  The sorted name/value pairs are concatenated together into a
   //     single string by using an "&" character (ASCII code 38) as
   //     separator.
  .join('&')

  var base = [
    rfc3986(httpMethod ? httpMethod.toUpperCase() : 'GET'),
    rfc3986(base_uri),
    rfc3986(normalized)
  ].join('&')

  return base
}

function hmacsign (httpMethod, base_uri, params, consumer_secret, token_secret) {
  var base = generateBase(httpMethod, base_uri, params)
  var key = [
    consumer_secret || '',
    token_secret || ''
  ].map(rfc3986).join('&')

  return sha1(key, base)
}

function rsasign (httpMethod, base_uri, params, private_key, token_secret) {
  var base = generateBase(httpMethod, base_uri, params)
  var key = private_key || ''

  return rsa(key, base)
}

function plaintext (consumer_secret, token_secret) {
  var key = [
    consumer_secret || '',
    token_secret || ''
  ].map(rfc3986).join('&')

  return key
}

function sign (signMethod, httpMethod, base_uri, params, consumer_secret, token_secret) {
  var method
  var skipArgs = 1

  switch (signMethod) {
    case 'RSA-SHA1':
      method = rsasign
      break
    case 'HMAC-SHA1':
      method = hmacsign
      break
    case 'PLAINTEXT':
      method = plaintext
      skipArgs = 4
      break
    default:
     throw new Error("Signature method not supported: " + signMethod)
  }

  return method.apply(null, [].slice.call(arguments, skipArgs))
}

exports.hmacsign = hmacsign
exports.rsasign = rsasign
exports.plaintext = plaintext
exports.sign = sign
exports.rfc3986 = rfc3986

},{"crypto":undefined,"querystring":undefined}],98:[function(require,module,exports){
// Load modules

var Stringify = require('./stringify');
var Parse = require('./parse');


// Declare internals

var internals = {};


module.exports = {
    stringify: Stringify,
    parse: Parse
};

},{"./parse":99,"./stringify":100}],99:[function(require,module,exports){
// Load modules

var Utils = require('./utils');


// Declare internals

var internals = {
    delimiter: '&',
    depth: 5,
    arrayLimit: 20,
    parameterLimit: 1000,
    strictNullHandling: false,
    plainObjects: false,
    allowPrototypes: false
};


internals.parseValues = function (str, options) {

    var obj = {};
    var parts = str.split(options.delimiter, options.parameterLimit === Infinity ? undefined : options.parameterLimit);

    for (var i = 0, il = parts.length; i < il; ++i) {
        var part = parts[i];
        var pos = part.indexOf(']=') === -1 ? part.indexOf('=') : part.indexOf(']=') + 1;

        if (pos === -1) {
            obj[Utils.decode(part)] = '';

            if (options.strictNullHandling) {
                obj[Utils.decode(part)] = null;
            }
        }
        else {
            var key = Utils.decode(part.slice(0, pos));
            var val = Utils.decode(part.slice(pos + 1));

            if (!Object.prototype.hasOwnProperty.call(obj, key)) {
                obj[key] = val;
            }
            else {
                obj[key] = [].concat(obj[key]).concat(val);
            }
        }
    }

    return obj;
};


internals.parseObject = function (chain, val, options) {

    if (!chain.length) {
        return val;
    }

    var root = chain.shift();

    var obj;
    if (root === '[]') {
        obj = [];
        obj = obj.concat(internals.parseObject(chain, val, options));
    }
    else {
        obj = options.plainObjects ? Object.create(null) : {};
        var cleanRoot = root[0] === '[' && root[root.length - 1] === ']' ? root.slice(1, root.length - 1) : root;
        var index = parseInt(cleanRoot, 10);
        var indexString = '' + index;
        if (!isNaN(index) &&
            root !== cleanRoot &&
            indexString === cleanRoot &&
            index >= 0 &&
            (options.parseArrays &&
             index <= options.arrayLimit)) {

            obj = [];
            obj[index] = internals.parseObject(chain, val, options);
        }
        else {
            obj[cleanRoot] = internals.parseObject(chain, val, options);
        }
    }

    return obj;
};


internals.parseKeys = function (key, val, options) {

    if (!key) {
        return;
    }

    // Transform dot notation to bracket notation

    if (options.allowDots) {
        key = key.replace(/\.([^\.\[]+)/g, '[$1]');
    }

    // The regex chunks

    var parent = /^([^\[\]]*)/;
    var child = /(\[[^\[\]]*\])/g;

    // Get the parent

    var segment = parent.exec(key);

    // Stash the parent if it exists

    var keys = [];
    if (segment[1]) {
        // If we aren't using plain objects, optionally prefix keys
        // that would overwrite object prototype properties
        if (!options.plainObjects &&
            Object.prototype.hasOwnProperty(segment[1])) {

            if (!options.allowPrototypes) {
                return;
            }
        }

        keys.push(segment[1]);
    }

    // Loop through children appending to the array until we hit depth

    var i = 0;
    while ((segment = child.exec(key)) !== null && i < options.depth) {

        ++i;
        if (!options.plainObjects &&
            Object.prototype.hasOwnProperty(segment[1].replace(/\[|\]/g, ''))) {

            if (!options.allowPrototypes) {
                continue;
            }
        }
        keys.push(segment[1]);
    }

    // If there's a remainder, just add whatever is left

    if (segment) {
        keys.push('[' + key.slice(segment.index) + ']');
    }

    return internals.parseObject(keys, val, options);
};


module.exports = function (str, options) {

    options = options || {};
    options.delimiter = typeof options.delimiter === 'string' || Utils.isRegExp(options.delimiter) ? options.delimiter : internals.delimiter;
    options.depth = typeof options.depth === 'number' ? options.depth : internals.depth;
    options.arrayLimit = typeof options.arrayLimit === 'number' ? options.arrayLimit : internals.arrayLimit;
    options.parseArrays = options.parseArrays !== false;
    options.allowDots = options.allowDots !== false;
    options.plainObjects = typeof options.plainObjects === 'boolean' ? options.plainObjects : internals.plainObjects;
    options.allowPrototypes = typeof options.allowPrototypes === 'boolean' ? options.allowPrototypes : internals.allowPrototypes;
    options.parameterLimit = typeof options.parameterLimit === 'number' ? options.parameterLimit : internals.parameterLimit;
    options.strictNullHandling = typeof options.strictNullHandling === 'boolean' ? options.strictNullHandling : internals.strictNullHandling;

    if (str === '' ||
        str === null ||
        typeof str === 'undefined') {

        return options.plainObjects ? Object.create(null) : {};
    }

    var tempObj = typeof str === 'string' ? internals.parseValues(str, options) : str;
    var obj = options.plainObjects ? Object.create(null) : {};

    // Iterate over the keys and setup the new object

    var keys = Object.keys(tempObj);
    for (var i = 0, il = keys.length; i < il; ++i) {
        var key = keys[i];
        var newObj = internals.parseKeys(key, tempObj[key], options);
        obj = Utils.merge(obj, newObj, options);
    }

    return Utils.compact(obj);
};

},{"./utils":101}],100:[function(require,module,exports){
// Load modules

var Utils = require('./utils');


// Declare internals

var internals = {
    delimiter: '&',
    arrayPrefixGenerators: {
        brackets: function (prefix, key) {

            return prefix + '[]';
        },
        indices: function (prefix, key) {

            return prefix + '[' + key + ']';
        },
        repeat: function (prefix, key) {

            return prefix;
        }
    },
    strictNullHandling: false
};


internals.stringify = function (obj, prefix, generateArrayPrefix, strictNullHandling, filter) {

    if (typeof filter === 'function') {
        obj = filter(prefix, obj);
    }
    else if (Utils.isBuffer(obj)) {
        obj = obj.toString();
    }
    else if (obj instanceof Date) {
        obj = obj.toISOString();
    }
    else if (obj === null) {
        if (strictNullHandling) {
            return Utils.encode(prefix);
        }

        obj = '';
    }

    if (typeof obj === 'string' ||
        typeof obj === 'number' ||
        typeof obj === 'boolean') {

        return [Utils.encode(prefix) + '=' + Utils.encode(obj)];
    }

    var values = [];

    if (typeof obj === 'undefined') {
        return values;
    }

    var objKeys = Array.isArray(filter) ? filter : Object.keys(obj);
    for (var i = 0, il = objKeys.length; i < il; ++i) {
        var key = objKeys[i];

        if (Array.isArray(obj)) {
            values = values.concat(internals.stringify(obj[key], generateArrayPrefix(prefix, key), generateArrayPrefix, strictNullHandling, filter));
        }
        else {
            values = values.concat(internals.stringify(obj[key], prefix + '[' + key + ']', generateArrayPrefix, strictNullHandling, filter));
        }
    }

    return values;
};


module.exports = function (obj, options) {

    options = options || {};
    var delimiter = typeof options.delimiter === 'undefined' ? internals.delimiter : options.delimiter;
    var strictNullHandling = typeof options.strictNullHandling === 'boolean' ? options.strictNullHandling : internals.strictNullHandling;
    var objKeys;
    var filter;
    if (typeof options.filter === 'function') {
        filter = options.filter;
        obj = filter('', obj);
    }
    else if (Array.isArray(options.filter)) {
        objKeys = filter = options.filter;
    }

    var keys = [];

    if (typeof obj !== 'object' ||
        obj === null) {

        return '';
    }

    var arrayFormat;
    if (options.arrayFormat in internals.arrayPrefixGenerators) {
        arrayFormat = options.arrayFormat;
    }
    else if ('indices' in options) {
        arrayFormat = options.indices ? 'indices' : 'repeat';
    }
    else {
        arrayFormat = 'indices';
    }

    var generateArrayPrefix = internals.arrayPrefixGenerators[arrayFormat];

    if (!objKeys) {
        objKeys = Object.keys(obj);
    }
    for (var i = 0, il = objKeys.length; i < il; ++i) {
        var key = objKeys[i];
        keys = keys.concat(internals.stringify(obj[key], key, generateArrayPrefix, strictNullHandling, filter));
    }

    return keys.join(delimiter);
};

},{"./utils":101}],101:[function(require,module,exports){
// Load modules


// Declare internals

var internals = {};
internals.hexTable = new Array(256);
for (var h = 0; h < 256; ++h) {
    internals.hexTable[h] = '%' + ((h < 16 ? '0' : '') + h.toString(16)).toUpperCase();
}


exports.arrayToObject = function (source, options) {

    var obj = options.plainObjects ? Object.create(null) : {};
    for (var i = 0, il = source.length; i < il; ++i) {
        if (typeof source[i] !== 'undefined') {

            obj[i] = source[i];
        }
    }

    return obj;
};


exports.merge = function (target, source, options) {

    if (!source) {
        return target;
    }

    if (typeof source !== 'object') {
        if (Array.isArray(target)) {
            target.push(source);
        }
        else if (typeof target === 'object') {
            target[source] = true;
        }
        else {
            target = [target, source];
        }

        return target;
    }

    if (typeof target !== 'object') {
        target = [target].concat(source);
        return target;
    }

    if (Array.isArray(target) &&
        !Array.isArray(source)) {

        target = exports.arrayToObject(target, options);
    }

    var keys = Object.keys(source);
    for (var k = 0, kl = keys.length; k < kl; ++k) {
        var key = keys[k];
        var value = source[key];

        if (!Object.prototype.hasOwnProperty.call(target, key)) {
            target[key] = value;
        }
        else {
            target[key] = exports.merge(target[key], value, options);
        }
    }

    return target;
};


exports.decode = function (str) {

    try {
        return decodeURIComponent(str.replace(/\+/g, ' '));
    } catch (e) {
        return str;
    }
};

exports.encode = function (str) {

    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    if (typeof str !== 'string') {
        str = '' + str;
    }

    var out = '';
    for (var i = 0, il = str.length; i < il; ++i) {
        var c = str.charCodeAt(i);

        if (c === 0x2D || // -
            c === 0x2E || // .
            c === 0x5F || // _
            c === 0x7E || // ~
            (c >= 0x30 && c <= 0x39) || // 0-9
            (c >= 0x41 && c <= 0x5A) || // a-z
            (c >= 0x61 && c <= 0x7A)) { // A-Z

            out += str[i];
            continue;
        }

        if (c < 0x80) {
            out += internals.hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out += internals.hexTable[0xC0 | (c >> 6)] + internals.hexTable[0x80 | (c & 0x3F)];
            continue;
        }

        if (c < 0xD800 || c >= 0xE000) {
            out += internals.hexTable[0xE0 | (c >> 12)] + internals.hexTable[0x80 | ((c >> 6) & 0x3F)] + internals.hexTable[0x80 | (c & 0x3F)];
            continue;
        }

        ++i;
        c = 0x10000 + (((c & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF));
        out += internals.hexTable[0xF0 | (c >> 18)] + internals.hexTable[0x80 | ((c >> 12) & 0x3F)] + internals.hexTable[0x80 | ((c >> 6) & 0x3F)] + internals.hexTable[0x80 | (c & 0x3F)];
    }

    return out;
};

exports.compact = function (obj, refs) {

    if (typeof obj !== 'object' ||
        obj === null) {

        return obj;
    }

    refs = refs || [];
    var lookup = refs.indexOf(obj);
    if (lookup !== -1) {
        return refs[lookup];
    }

    refs.push(obj);

    if (Array.isArray(obj)) {
        var compacted = [];

        for (var i = 0, il = obj.length; i < il; ++i) {
            if (typeof obj[i] !== 'undefined') {
                compacted.push(obj[i]);
            }
        }

        return compacted;
    }

    var keys = Object.keys(obj);
    for (i = 0, il = keys.length; i < il; ++i) {
        var key = keys[i];
        obj[key] = exports.compact(obj[key], refs);
    }

    return obj;
};


exports.isRegExp = function (obj) {

    return Object.prototype.toString.call(obj) === '[object RegExp]';
};


exports.isBuffer = function (obj) {

    if (obj === null ||
        typeof obj === 'undefined') {

        return false;
    }

    return !!(obj.constructor &&
              obj.constructor.isBuffer &&
              obj.constructor.isBuffer(obj));
};

},{}],102:[function(require,module,exports){
var util = require('util')
var Stream = require('stream')
var StringDecoder = require('string_decoder').StringDecoder

module.exports = StringStream
module.exports.AlignedStringDecoder = AlignedStringDecoder

function StringStream(from, to) {
  if (!(this instanceof StringStream)) return new StringStream(from, to)

  Stream.call(this)

  if (from == null) from = 'utf8'

  this.readable = this.writable = true
  this.paused = false
  this.toEncoding = (to == null ? from : to)
  this.fromEncoding = (to == null ? '' : from)
  this.decoder = new AlignedStringDecoder(this.toEncoding)
}
util.inherits(StringStream, Stream)

StringStream.prototype.write = function(data) {
  if (!this.writable) {
    var err = new Error('stream not writable')
    err.code = 'EPIPE'
    this.emit('error', err)
    return false
  }
  if (this.fromEncoding) {
    if (Buffer.isBuffer(data)) data = data.toString()
    data = new Buffer(data, this.fromEncoding)
  }
  var string = this.decoder.write(data)
  if (string.length) this.emit('data', string)
  return !this.paused
}

StringStream.prototype.flush = function() {
  if (this.decoder.flush) {
    var string = this.decoder.flush()
    if (string.length) this.emit('data', string)
  }
}

StringStream.prototype.end = function() {
  if (!this.writable && !this.readable) return
  this.flush()
  this.emit('end')
  this.writable = this.readable = false
  this.destroy()
}

StringStream.prototype.destroy = function() {
  this.decoder = null
  this.writable = this.readable = false
  this.emit('close')
}

StringStream.prototype.pause = function() {
  this.paused = true
}

StringStream.prototype.resume = function () {
  if (this.paused) this.emit('drain')
  this.paused = false
}

function AlignedStringDecoder(encoding) {
  StringDecoder.call(this, encoding)

  switch (this.encoding) {
    case 'base64':
      this.write = alignedWrite
      this.alignedBuffer = new Buffer(3)
      this.alignedBytes = 0
      break
  }
}
util.inherits(AlignedStringDecoder, StringDecoder)

AlignedStringDecoder.prototype.flush = function() {
  if (!this.alignedBuffer || !this.alignedBytes) return ''
  var leftover = this.alignedBuffer.toString(this.encoding, 0, this.alignedBytes)
  this.alignedBytes = 0
  return leftover
}

function alignedWrite(buffer) {
  var rem = (this.alignedBytes + buffer.length) % this.alignedBuffer.length
  if (!rem && !this.alignedBytes) return buffer.toString(this.encoding)

  var returnBuffer = new Buffer(this.alignedBytes + buffer.length - rem)

  this.alignedBuffer.copy(returnBuffer, 0, 0, this.alignedBytes)
  buffer.copy(returnBuffer, this.alignedBytes, 0, buffer.length - rem)

  buffer.copy(this.alignedBuffer, 0, buffer.length - rem, buffer.length)
  this.alignedBytes = rem

  return returnBuffer.toString(this.encoding)
}

},{"stream":undefined,"string_decoder":undefined,"util":undefined}],103:[function(require,module,exports){
/*!
 * Copyright (c) 2015, Salesforce.com, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Salesforce.com nor the names of its contributors may
 * be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
'use strict';
var net = require('net');
var urlParse = require('url').parse;
var pubsuffix = require('./pubsuffix');
var Store = require('./store').Store;
var MemoryCookieStore = require('./memstore').MemoryCookieStore;
var pathMatch = require('./pathMatch').pathMatch;
var VERSION = require('../package.json').version;

var punycode;
try {
  punycode = require('punycode');
} catch(e) {
  console.warn("cookie: can't load punycode; won't use punycode for domain normalization");
}

var DATE_DELIM = /[\x09\x20-\x2F\x3B-\x40\x5B-\x60\x7B-\x7E]/;

// From RFC6265 S4.1.1
// note that it excludes \x3B ";"
var COOKIE_OCTET  = /[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]/;
var COOKIE_OCTETS = new RegExp('^'+COOKIE_OCTET.source+'$');

// Double quotes are part of the value (see: S4.1.1).
// '\r', '\n' and '\0' should be treated as a terminator in the "relaxed" mode
// (see: https://github.com/ChromiumWebApps/chromium/blob/b3d3b4da8bb94c1b2e061600df106d590fda3620/net/cookies/parsed_cookie.cc#L60)
// '=' and ';' are attribute/values separators
// (see: https://github.com/ChromiumWebApps/chromium/blob/b3d3b4da8bb94c1b2e061600df106d590fda3620/net/cookies/parsed_cookie.cc#L64)
var COOKIE_PAIR = /^([^=;]+)\s*=\s*(("?)[^\n\r\0]*\3)/;

// RFC6265 S4.1.1 defines path value as 'any CHAR except CTLs or ";"'
// Note ';' is \x3B
var PATH_VALUE = /[\x20-\x3A\x3C-\x7E]+/;

// Used for checking whether or not there is a trailing semi-colon
var TRAILING_SEMICOLON = /;+$/;

var DAY_OF_MONTH = /^(\d{1,2})[^\d]*$/;
var TIME = /^(\d{1,2})[^\d]*:(\d{1,2})[^\d]*:(\d{1,2})[^\d]*$/;
var MONTH = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;

var MONTH_TO_NUM = {
  jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
  jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
};
var NUM_TO_MONTH = [
  'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'
];
var NUM_TO_DAY = [
  'Sun','Mon','Tue','Wed','Thu','Fri','Sat'
];

var YEAR = /^(\d{2}|\d{4})$/; // 2 to 4 digits

var MAX_TIME = 2147483647000; // 31-bit max
var MIN_TIME = 0; // 31-bit min


// RFC6265 S5.1.1 date parser:
function parseDate(str) {
  if (!str) {
    return;
  }

  /* RFC6265 S5.1.1:
   * 2. Process each date-token sequentially in the order the date-tokens
   * appear in the cookie-date
   */
  var tokens = str.split(DATE_DELIM);
  if (!tokens) {
    return;
  }

  var hour = null;
  var minutes = null;
  var seconds = null;
  var day = null;
  var month = null;
  var year = null;

  for (var i=0; i<tokens.length; i++) {
    var token = tokens[i].trim();
    if (!token.length) {
      continue;
    }

    var result;

    /* 2.1. If the found-time flag is not set and the token matches the time
     * production, set the found-time flag and set the hour- value,
     * minute-value, and second-value to the numbers denoted by the digits in
     * the date-token, respectively.  Skip the remaining sub-steps and continue
     * to the next date-token.
     */
    if (seconds === null) {
      result = TIME.exec(token);
      if (result) {
        hour = parseInt(result[1], 10);
        minutes = parseInt(result[2], 10);
        seconds = parseInt(result[3], 10);
        /* RFC6265 S5.1.1.5:
         * [fail if]
         * *  the hour-value is greater than 23,
         * *  the minute-value is greater than 59, or
         * *  the second-value is greater than 59.
         */
        if(hour > 23 || minutes > 59 || seconds > 59) {
          return;
        }

        continue;
      }
    }

    /* 2.2. If the found-day-of-month flag is not set and the date-token matches
     * the day-of-month production, set the found-day-of- month flag and set
     * the day-of-month-value to the number denoted by the date-token.  Skip
     * the remaining sub-steps and continue to the next date-token.
     */
    if (day === null) {
      result = DAY_OF_MONTH.exec(token);
      if (result) {
        day = parseInt(result, 10);
        /* RFC6265 S5.1.1.5:
         * [fail if] the day-of-month-value is less than 1 or greater than 31
         */
        if(day < 1 || day > 31) {
          return;
        }
        continue;
      }
    }

    /* 2.3. If the found-month flag is not set and the date-token matches the
     * month production, set the found-month flag and set the month-value to
     * the month denoted by the date-token.  Skip the remaining sub-steps and
     * continue to the next date-token.
     */
    if (month === null) {
      result = MONTH.exec(token);
      if (result) {
        month = MONTH_TO_NUM[result[1].toLowerCase()];
        continue;
      }
    }

    /* 2.4. If the found-year flag is not set and the date-token matches the year
     * production, set the found-year flag and set the year-value to the number
     * denoted by the date-token.  Skip the remaining sub-steps and continue to
     * the next date-token.
     */
    if (year === null) {
      result = YEAR.exec(token);
      if (result) {
        year = parseInt(result[0], 10);
        /* From S5.1.1:
         * 3.  If the year-value is greater than or equal to 70 and less
         * than or equal to 99, increment the year-value by 1900.
         * 4.  If the year-value is greater than or equal to 0 and less
         * than or equal to 69, increment the year-value by 2000.
         */
        if (70 <= year && year <= 99) {
          year += 1900;
        } else if (0 <= year && year <= 69) {
          year += 2000;
        }

        if (year < 1601) {
          return; // 5. ... the year-value is less than 1601
        }
      }
    }
  }

  if (seconds === null || day === null || month === null || year === null) {
    return; // 5. ... at least one of the found-day-of-month, found-month, found-
            // year, or found-time flags is not set,
  }

  return new Date(Date.UTC(year, month, day, hour, minutes, seconds));
}

function formatDate(date) {
  var d = date.getUTCDate(); d = d >= 10 ? d : '0'+d;
  var h = date.getUTCHours(); h = h >= 10 ? h : '0'+h;
  var m = date.getUTCMinutes(); m = m >= 10 ? m : '0'+m;
  var s = date.getUTCSeconds(); s = s >= 10 ? s : '0'+s;
  return NUM_TO_DAY[date.getUTCDay()] + ', ' +
    d+' '+ NUM_TO_MONTH[date.getUTCMonth()] +' '+ date.getUTCFullYear() +' '+
    h+':'+m+':'+s+' GMT';
}

// S5.1.2 Canonicalized Host Names
function canonicalDomain(str) {
  if (str == null) {
    return null;
  }
  str = str.trim().replace(/^\./,''); // S4.1.2.3 & S5.2.3: ignore leading .

  // convert to IDN if any non-ASCII characters
  if (punycode && /[^\u0001-\u007f]/.test(str)) {
    str = punycode.toASCII(str);
  }

  return str.toLowerCase();
}

// S5.1.3 Domain Matching
function domainMatch(str, domStr, canonicalize) {
  if (str == null || domStr == null) {
    return null;
  }
  if (canonicalize !== false) {
    str = canonicalDomain(str);
    domStr = canonicalDomain(domStr);
  }

  /*
   * "The domain string and the string are identical. (Note that both the
   * domain string and the string will have been canonicalized to lower case at
   * this point)"
   */
  if (str == domStr) {
    return true;
  }

  /* "All of the following [three] conditions hold:" (order adjusted from the RFC) */

  /* "* The string is a host name (i.e., not an IP address)." */
  if (net.isIP(str)) {
    return false;
  }

  /* "* The domain string is a suffix of the string" */
  var idx = str.indexOf(domStr);
  if (idx <= 0) {
    return false; // it's a non-match (-1) or prefix (0)
  }

  // e.g "a.b.c".indexOf("b.c") === 2
  // 5 === 3+2
  if (str.length !== domStr.length + idx) { // it's not a suffix
    return false;
  }

  /* "* The last character of the string that is not included in the domain
  * string is a %x2E (".") character." */
  if (str.substr(idx-1,1) !== '.') {
    return false;
  }

  return true;
}


// RFC6265 S5.1.4 Paths and Path-Match

/*
 * "The user agent MUST use an algorithm equivalent to the following algorithm
 * to compute the default-path of a cookie:"
 *
 * Assumption: the path (and not query part or absolute uri) is passed in.
 */
function defaultPath(path) {
  // "2. If the uri-path is empty or if the first character of the uri-path is not
  // a %x2F ("/") character, output %x2F ("/") and skip the remaining steps.
  if (!path || path.substr(0,1) !== "/") {
    return "/";
  }

  // "3. If the uri-path contains no more than one %x2F ("/") character, output
  // %x2F ("/") and skip the remaining step."
  if (path === "/") {
    return path;
  }

  var rightSlash = path.lastIndexOf("/");
  if (rightSlash === 0) {
    return "/";
  }

  // "4. Output the characters of the uri-path from the first character up to,
  // but not including, the right-most %x2F ("/")."
  return path.slice(0, rightSlash);
}


function parse(str) {
  str = str.trim();

  // S4.1.1 Trailing semi-colons are not part of the specification.
  var semiColonCheck = TRAILING_SEMICOLON.exec(str);
  if (semiColonCheck) {
    str = str.slice(0, semiColonCheck.index);
  }

  // We use a regex to parse the "name-value-pair" part of S5.2
  var firstSemi = str.indexOf(';'); // S5.2 step 1
  var result = COOKIE_PAIR.exec(firstSemi === -1 ? str : str.substr(0,firstSemi));

  // Rx satisfies the "the name string is empty" and "lacks a %x3D ("=")"
  // constraints as well as trimming any whitespace.
  if (!result) {
    return;
  }

  var c = new Cookie();
  c.key = result[1].trim();
  c.value = result[2].trim();

  if (firstSemi === -1) {
    return c;
  }

  // S5.2.3 "unparsed-attributes consist of the remainder of the set-cookie-string
  // (including the %x3B (";") in question)." plus later on in the same section
  // "discard the first ";" and trim".
  var unparsed = str.slice(firstSemi).replace(/^\s*;\s*/,'').trim();

  // "If the unparsed-attributes string is empty, skip the rest of these
  // steps."
  if (unparsed.length === 0) {
    return c;
  }

  /*
   * S5.2 says that when looping over the items "[p]rocess the attribute-name
   * and attribute-value according to the requirements in the following
   * subsections" for every item.  Plus, for many of the individual attributes
   * in S5.3 it says to use the "attribute-value of the last attribute in the
   * cookie-attribute-list".  Therefore, in this implementation, we overwrite
   * the previous value.
   */
  var cookie_avs = unparsed.split(/\s*;\s*/);
  while (cookie_avs.length) {
    var av = cookie_avs.shift();
    var av_sep = av.indexOf('=');
    var av_key, av_value;

    if (av_sep === -1) {
      av_key = av;
      av_value = null;
    } else {
      av_key = av.substr(0,av_sep);
      av_value = av.substr(av_sep+1);
    }

    av_key = av_key.trim().toLowerCase();

    if (av_value) {
      av_value = av_value.trim();
    }

    switch(av_key) {
    case 'expires': // S5.2.1
      if (av_value) {
        var exp = parseDate(av_value);
        // "If the attribute-value failed to parse as a cookie date, ignore the
        // cookie-av."
        if (exp) {
          // over and underflow not realistically a concern: V8's getTime() seems to
          // store something larger than a 32-bit time_t (even with 32-bit node)
          c.expires = exp;
        }
      }
      break;

    case 'max-age': // S5.2.2
      if (av_value) {
        // "If the first character of the attribute-value is not a DIGIT or a "-"
        // character ...[or]... If the remainder of attribute-value contains a
        // non-DIGIT character, ignore the cookie-av."
        if (/^-?[0-9]+$/.test(av_value)) {
          var delta = parseInt(av_value, 10);
          // "If delta-seconds is less than or equal to zero (0), let expiry-time
          // be the earliest representable date and time."
          c.setMaxAge(delta);
        }
      }
      break;

    case 'domain': // S5.2.3
      // "If the attribute-value is empty, the behavior is undefined.  However,
      // the user agent SHOULD ignore the cookie-av entirely."
      if (av_value) {
        // S5.2.3 "Let cookie-domain be the attribute-value without the leading %x2E
        // (".") character."
        var domain = av_value.trim().replace(/^\./, '');
        if (domain) {
          // "Convert the cookie-domain to lower case."
          c.domain = domain.toLowerCase();
        }
      }
      break;

    case 'path': // S5.2.4
      /*
       * "If the attribute-value is empty or if the first character of the
       * attribute-value is not %x2F ("/"):
       *   Let cookie-path be the default-path.
       * Otherwise:
       *   Let cookie-path be the attribute-value."
       *
       * We'll represent the default-path as null since it depends on the
       * context of the parsing.
       */
      c.path = av_value && av_value[0] === "/" ? av_value : null;
      break;

    case 'secure': // S5.2.5
      /*
       * "If the attribute-name case-insensitively matches the string "Secure",
       * the user agent MUST append an attribute to the cookie-attribute-list
       * with an attribute-name of Secure and an empty attribute-value."
       */
      c.secure = true;
      break;

    case 'httponly': // S5.2.6 -- effectively the same as 'secure'
      c.httpOnly = true;
      break;

    default:
      c.extensions = c.extensions || [];
      c.extensions.push(av);
      break;
    }
  }

  return c;
}

// avoid the V8 deoptimization monster!
function jsonParse(str) {
  var obj;
  try {
    obj = JSON.parse(str);
  } catch (e) {
    return e;
  }
  return obj;
}

function fromJSON(str) {
  if (!str) {
    return null;
  }

  var obj;
  if (typeof str === 'string') {
    obj = jsonParse(str);
    if (obj instanceof Error) {
      return null;
    }
  } else {
    // assume it's an Object
    obj = str;
  }

  var c = new Cookie();
  for (var i=0; i<Cookie.serializableProperties.length; i++) {
    var prop = Cookie.serializableProperties[i];
    if (obj[prop] === undefined ||
        obj[prop] === Cookie.prototype[prop])
    {
      continue; // leave as prototype default
    }

    if (prop === 'expires' ||
        prop === 'creation' ||
        prop === 'lastAccessed')
    {
      if (obj[prop] === null) {
        c[prop] = null;
      } else {
        c[prop] = obj[prop] == "Infinity" ?
          "Infinity" : new Date(obj[prop]);
      }
    } else {
      c[prop] = obj[prop];
    }
  }

  return c;
}

/* Section 5.4 part 2:
 * "*  Cookies with longer paths are listed before cookies with
 *     shorter paths.
 *
 *  *  Among cookies that have equal-length path fields, cookies with
 *     earlier creation-times are listed before cookies with later
 *     creation-times."
 */

function cookieCompare(a,b) {
  var cmp = 0;

  // descending for length: b CMP a
  var aPathLen = a.path ? a.path.length : 0;
  var bPathLen = b.path ? b.path.length : 0;
  cmp = bPathLen - aPathLen;
  if (cmp !== 0) {
    return cmp;
  }

  // ascending for time: a CMP b
  var aTime = a.creation ? a.creation.getTime() : MAX_TIME;
  var bTime = b.creation ? b.creation.getTime() : MAX_TIME;
  cmp = aTime - bTime;
  if (cmp !== 0) {
    return cmp;
  }

  // break ties for the same millisecond (precision of JavaScript's clock)
  cmp = a.creationIndex - b.creationIndex;

  return cmp;
}

// Gives the permutation of all possible pathMatch()es of a given path. The
// array is in longest-to-shortest order.  Handy for indexing.
function permutePath(path) {
  if (path === '/') {
    return ['/'];
  }
  if (path.lastIndexOf('/') === path.length-1) {
    path = path.substr(0,path.length-1);
  }
  var permutations = [path];
  while (path.length > 1) {
    var lindex = path.lastIndexOf('/');
    if (lindex === 0) {
      break;
    }
    path = path.substr(0,lindex);
    permutations.push(path);
  }
  permutations.push('/');
  return permutations;
}

function getCookieContext(url) {
  if (url instanceof Object) {
    return url;
  }
  // NOTE: decodeURI will throw on malformed URIs (see GH-32).
  // Therefore, we will just skip decoding for such URIs.
  try {
    url = decodeURI(url);
  }
  catch(err) {
    // Silently swallow error
  }

  return urlParse(url);
}

function Cookie(opts) {
  opts = opts || {};

  Object.keys(opts).forEach(function(prop) {
    if (Cookie.prototype.hasOwnProperty(prop) &&
        Cookie.prototype[prop] !== opts[prop] &&
        prop.substr(0,1) !== '_')
    {
      this[prop] = opts[prop];
    }
  }, this);

  this.creation = this.creation || new Date();

  // used to break creation ties in cookieCompare():
  Object.defineProperty(this, 'creationIndex', {
    configurable: false,
    enumerable: false, // important for assert.deepEqual checks
    writable: true,
    value: ++Cookie.cookiesCreated
  });
}

Cookie.cookiesCreated = 0; // incremented each time a cookie is created

Cookie.parse = parse;
Cookie.fromJSON = fromJSON;

Cookie.prototype.key = "";
Cookie.prototype.value = "";

// the order in which the RFC has them:
Cookie.prototype.expires = "Infinity"; // coerces to literal Infinity
Cookie.prototype.maxAge = null; // takes precedence over expires for TTL
Cookie.prototype.domain = null;
Cookie.prototype.path = null;
Cookie.prototype.secure = false;
Cookie.prototype.httpOnly = false;
Cookie.prototype.extensions = null;

// set by the CookieJar:
Cookie.prototype.hostOnly = null; // boolean when set
Cookie.prototype.pathIsDefault = null; // boolean when set
Cookie.prototype.creation = null; // Date when set; defaulted by Cookie.parse
Cookie.prototype.lastAccessed = null; // Date when set
Object.defineProperty(Cookie.prototype, 'creationIndex', {
  configurable: true,
  enumerable: false,
  writable: true,
  value: 0
});

Cookie.serializableProperties = Object.keys(Cookie.prototype)
  .filter(function(prop) {
    return !(
      Cookie.prototype[prop] instanceof Function ||
      prop === 'creationIndex' ||
      prop.substr(0,1) === '_'
    );
  });

Cookie.prototype.inspect = function inspect() {
  var now = Date.now();
  return 'Cookie="'+this.toString() +
    '; hostOnly='+(this.hostOnly != null ? this.hostOnly : '?') +
    '; aAge='+(this.lastAccessed ? (now-this.lastAccessed.getTime())+'ms' : '?') +
    '; cAge='+(this.creation ? (now-this.creation.getTime())+'ms' : '?') +
    '"';
};

Cookie.prototype.toJSON = function() {
  var obj = {};

  var props = Cookie.serializableProperties;
  for (var i=0; i<props.length; i++) {
    var prop = props[i];
    if (this[prop] === Cookie.prototype[prop]) {
      continue; // leave as prototype default
    }

    if (prop === 'expires' ||
        prop === 'creation' ||
        prop === 'lastAccessed')
    {
      if (this[prop] === null) {
        obj[prop] = null;
      } else {
        obj[prop] = this[prop] == "Infinity" ? // intentionally not ===
          "Infinity" : this[prop].toISOString();
      }
    } else if (prop === 'maxAge') {
      if (this[prop] !== null) {
        // again, intentionally not ===
        obj[prop] = (this[prop] == Infinity || this[prop] == -Infinity) ?
          this[prop].toString() : this[prop];
      }
    } else {
      if (this[prop] !== Cookie.prototype[prop]) {
        obj[prop] = this[prop];
      }
    }
  }

  return obj;
};

Cookie.prototype.clone = function() {
  return fromJSON(this.toJSON());
};

Cookie.prototype.validate = function validate() {
  if (!COOKIE_OCTETS.test(this.value)) {
    return false;
  }
  if (this.expires != Infinity && !(this.expires instanceof Date) && !parseDate(this.expires)) {
    return false;
  }
  if (this.maxAge != null && this.maxAge <= 0) {
    return false; // "Max-Age=" non-zero-digit *DIGIT
  }
  if (this.path != null && !PATH_VALUE.test(this.path)) {
    return false;
  }

  var cdomain = this.cdomain();
  if (cdomain) {
    if (cdomain.match(/\.$/)) {
      return false; // S4.1.2.3 suggests that this is bad. domainMatch() tests confirm this
    }
    var suffix = pubsuffix.getPublicSuffix(cdomain);
    if (suffix == null) { // it's a public suffix
      return false;
    }
  }
  return true;
};

Cookie.prototype.setExpires = function setExpires(exp) {
  if (exp instanceof Date) {
    this.expires = exp;
  } else {
    this.expires = parseDate(exp) || "Infinity";
  }
};

Cookie.prototype.setMaxAge = function setMaxAge(age) {
  if (age === Infinity || age === -Infinity) {
    this.maxAge = age.toString(); // so JSON.stringify() works
  } else {
    this.maxAge = age;
  }
};

// gives Cookie header format
Cookie.prototype.cookieString = function cookieString() {
  var val = this.value;
  if (val == null) {
    val = '';
  }
  return this.key+'='+val;
};

// gives Set-Cookie header format
Cookie.prototype.toString = function toString() {
  var str = this.cookieString();

  if (this.expires != Infinity) {
    if (this.expires instanceof Date) {
      str += '; Expires='+formatDate(this.expires);
    } else {
      str += '; Expires='+this.expires;
    }
  }

  if (this.maxAge != null && this.maxAge != Infinity) {
    str += '; Max-Age='+this.maxAge;
  }

  if (this.domain && !this.hostOnly) {
    str += '; Domain='+this.domain;
  }
  if (this.path) {
    str += '; Path='+this.path;
  }

  if (this.secure) {
    str += '; Secure';
  }
  if (this.httpOnly) {
    str += '; HttpOnly';
  }
  if (this.extensions) {
    this.extensions.forEach(function(ext) {
      str += '; '+ext;
    });
  }

  return str;
};

// TTL() partially replaces the "expiry-time" parts of S5.3 step 3 (setCookie()
// elsewhere)
// S5.3 says to give the "latest representable date" for which we use Infinity
// For "expired" we use 0
Cookie.prototype.TTL = function TTL(now) {
  /* RFC6265 S4.1.2.2 If a cookie has both the Max-Age and the Expires
   * attribute, the Max-Age attribute has precedence and controls the
   * expiration date of the cookie.
   * (Concurs with S5.3 step 3)
   */
  if (this.maxAge != null) {
    return this.maxAge<=0 ? 0 : this.maxAge*1000;
  }

  var expires = this.expires;
  if (expires != Infinity) {
    if (!(expires instanceof Date)) {
      expires = parseDate(expires) || Infinity;
    }

    if (expires == Infinity) {
      return Infinity;
    }

    return expires.getTime() - (now || Date.now());
  }

  return Infinity;
};

// expiryTime() replaces the "expiry-time" parts of S5.3 step 3 (setCookie()
// elsewhere)
Cookie.prototype.expiryTime = function expiryTime(now) {
  if (this.maxAge != null) {
    var relativeTo = now || this.creation || new Date();
    var age = (this.maxAge <= 0) ? -Infinity : this.maxAge*1000;
    return relativeTo.getTime() + age;
  }

  if (this.expires == Infinity) {
    return Infinity;
  }
  return this.expires.getTime();
};

// expiryDate() replaces the "expiry-time" parts of S5.3 step 3 (setCookie()
// elsewhere), except it returns a Date
Cookie.prototype.expiryDate = function expiryDate(now) {
  var millisec = this.expiryTime(now);
  if (millisec == Infinity) {
    return new Date(MAX_TIME);
  } else if (millisec == -Infinity) {
    return new Date(MIN_TIME);
  } else {
    return new Date(millisec);
  }
};

// This replaces the "persistent-flag" parts of S5.3 step 3
Cookie.prototype.isPersistent = function isPersistent() {
  return (this.maxAge != null || this.expires != Infinity);
};

// Mostly S5.1.2 and S5.2.3:
Cookie.prototype.cdomain =
Cookie.prototype.canonicalizedDomain = function canonicalizedDomain() {
  if (this.domain == null) {
    return null;
  }
  return canonicalDomain(this.domain);
};

function CookieJar(store, rejectPublicSuffixes) {
  if (rejectPublicSuffixes != null) {
    this.rejectPublicSuffixes = rejectPublicSuffixes;
  }

  if (!store) {
    store = new MemoryCookieStore();
  }
  this.store = store;
}
CookieJar.prototype.store = null;
CookieJar.prototype.rejectPublicSuffixes = true;
var CAN_BE_SYNC = [];

CAN_BE_SYNC.push('setCookie');
CookieJar.prototype.setCookie = function(cookie, url, options, cb) {
  var err;
  var context = getCookieContext(url);
  if (options instanceof Function) {
    cb = options;
    options = {};
  }

  var host = canonicalDomain(context.hostname);

  // S5.3 step 1
  if (!(cookie instanceof Cookie)) {
    cookie = Cookie.parse(cookie);
  }
  if (!cookie) {
    err = new Error("Cookie failed to parse");
    return cb(options.ignoreError ? null : err);
  }

  // S5.3 step 2
  var now = options.now || new Date(); // will assign later to save effort in the face of errors

  // S5.3 step 3: NOOP; persistent-flag and expiry-time is handled by getCookie()

  // S5.3 step 4: NOOP; domain is null by default

  // S5.3 step 5: public suffixes
  if (this.rejectPublicSuffixes && cookie.domain) {
    var suffix = pubsuffix.getPublicSuffix(cookie.cdomain());
    if (suffix == null) { // e.g. "com"
      err = new Error("Cookie has domain set to a public suffix");
      return cb(options.ignoreError ? null : err);
    }
  }

  // S5.3 step 6:
  if (cookie.domain) {
    if (!domainMatch(host, cookie.cdomain(), false)) {
      err = new Error("Cookie not in this host's domain. Cookie:"+cookie.cdomain()+" Request:"+host);
      return cb(options.ignoreError ? null : err);
    }

    if (cookie.hostOnly == null) { // don't reset if already set
      cookie.hostOnly = false;
    }

  } else {
    cookie.hostOnly = true;
    cookie.domain = host;
  }

  //S5.2.4 If the attribute-value is empty or if the first character of the
  //attribute-value is not %x2F ("/"):
  //Let cookie-path be the default-path.
  if (!cookie.path || cookie.path[0] !== '/') {
    cookie.path = defaultPath(context.pathname);
    cookie.pathIsDefault = true;
  }

  // S5.3 step 8: NOOP; secure attribute
  // S5.3 step 9: NOOP; httpOnly attribute

  // S5.3 step 10
  if (options.http === false && cookie.httpOnly) {
    err = new Error("Cookie is HttpOnly and this isn't an HTTP API");
    return cb(options.ignoreError ? null : err);
  }

  var store = this.store;

  if (!store.updateCookie) {
    store.updateCookie = function(oldCookie, newCookie, cb) {
      this.putCookie(newCookie, cb);
    };
  }

  function withCookie(err, oldCookie) {
    if (err) {
      return cb(err);
    }

    var next = function(err) {
      if (err) {
        return cb(err);
      } else {
        cb(null, cookie);
      }
    };

    if (oldCookie) {
      // S5.3 step 11 - "If the cookie store contains a cookie with the same name,
      // domain, and path as the newly created cookie:"
      if (options.http === false && oldCookie.httpOnly) { // step 11.2
        err = new Error("old Cookie is HttpOnly and this isn't an HTTP API");
        return cb(options.ignoreError ? null : err);
      }
      cookie.creation = oldCookie.creation; // step 11.3
      cookie.creationIndex = oldCookie.creationIndex; // preserve tie-breaker
      cookie.lastAccessed = now;
      // Step 11.4 (delete cookie) is implied by just setting the new one:
      store.updateCookie(oldCookie, cookie, next); // step 12

    } else {
      cookie.creation = cookie.lastAccessed = now;
      store.putCookie(cookie, next); // step 12
    }
  }

  store.findCookie(cookie.domain, cookie.path, cookie.key, withCookie);
};

// RFC6365 S5.4
CAN_BE_SYNC.push('getCookies');
CookieJar.prototype.getCookies = function(url, options, cb) {
  var context = getCookieContext(url);
  if (options instanceof Function) {
    cb = options;
    options = {};
  }

  var host = canonicalDomain(context.hostname);
  var path = context.pathname || '/';

  var secure = options.secure;
  if (secure == null && context.protocol &&
      (context.protocol == 'https:' || context.protocol == 'wss:'))
  {
    secure = true;
  }

  var http = options.http;
  if (http == null) {
    http = true;
  }

  var now = options.now || Date.now();
  var expireCheck = options.expire !== false;
  var allPaths = !!options.allPaths;
  var store = this.store;

  function matchingCookie(c) {
    // "Either:
    //   The cookie's host-only-flag is true and the canonicalized
    //   request-host is identical to the cookie's domain.
    // Or:
    //   The cookie's host-only-flag is false and the canonicalized
    //   request-host domain-matches the cookie's domain."
    if (c.hostOnly) {
      if (c.domain != host) {
        return false;
      }
    } else {
      if (!domainMatch(host, c.domain, false)) {
        return false;
      }
    }

    // "The request-uri's path path-matches the cookie's path."
    if (!allPaths && !pathMatch(path, c.path)) {
      return false;
    }

    // "If the cookie's secure-only-flag is true, then the request-uri's
    // scheme must denote a "secure" protocol"
    if (c.secure && !secure) {
      return false;
    }

    // "If the cookie's http-only-flag is true, then exclude the cookie if the
    // cookie-string is being generated for a "non-HTTP" API"
    if (c.httpOnly && !http) {
      return false;
    }

    // deferred from S5.3
    // non-RFC: allow retention of expired cookies by choice
    if (expireCheck && c.expiryTime() <= now) {
      store.removeCookie(c.domain, c.path, c.key, function(){}); // result ignored
      return false;
    }

    return true;
  }

  store.findCookies(host, allPaths ? null : path, function(err,cookies) {
    if (err) {
      return cb(err);
    }

    cookies = cookies.filter(matchingCookie);

    // sorting of S5.4 part 2
    if (options.sort !== false) {
      cookies = cookies.sort(cookieCompare);
    }

    // S5.4 part 3
    var now = new Date();
    cookies.forEach(function(c) {
      c.lastAccessed = now;
    });
    // TODO persist lastAccessed

    cb(null,cookies);
  });
};

CAN_BE_SYNC.push('getCookieString');
CookieJar.prototype.getCookieString = function(/*..., cb*/) {
  var args = Array.prototype.slice.call(arguments,0);
  var cb = args.pop();
  var next = function(err,cookies) {
    if (err) {
      cb(err);
    } else {
      cb(null, cookies
        .sort(cookieCompare)
        .map(function(c){
          return c.cookieString();
        })
        .join('; '));
    }
  };
  args.push(next);
  this.getCookies.apply(this,args);
};

CAN_BE_SYNC.push('getSetCookieStrings');
CookieJar.prototype.getSetCookieStrings = function(/*..., cb*/) {
  var args = Array.prototype.slice.call(arguments,0);
  var cb = args.pop();
  var next = function(err,cookies) {
    if (err) {
      cb(err);
    } else {
      cb(null, cookies.map(function(c){
        return c.toString();
      }));
    }
  };
  args.push(next);
  this.getCookies.apply(this,args);
};

CAN_BE_SYNC.push('serialize');
CookieJar.prototype.serialize = function(cb) {
  var type = this.store.constructor.name;
  if (type === 'Object') {
    type = null;
  }

  // update README.md "Serialization Format" if you change this, please!
  var serialized = {
    // The version of tough-cookie that serialized this jar. Generally a good
    // practice since future versions can make data import decisions based on
    // known past behavior. When/if this matters, use `semver`.
    version: 'tough-cookie@'+VERSION,

    // add the store type, to make humans happy:
    storeType: type,

    // CookieJar configuration:
    rejectPublicSuffixes: !!this.rejectPublicSuffixes,

    // this gets filled from getAllCookies:
    cookies: []
  };

  if (!(this.store.getAllCookies &&
        typeof this.store.getAllCookies === 'function'))
  {
    return cb(new Error('store does not support getAllCookies and cannot be serialized'));
  }

  this.store.getAllCookies(function(err,cookies) {
    if (err) {
      return cb(err);
    }

    serialized.cookies = cookies.map(function(cookie) {
      // convert to serialized 'raw' cookies
      cookie = (cookie instanceof Cookie) ? cookie.toJSON() : cookie;

      // Remove the index so new ones get assigned during deserialization
      delete cookie.creationIndex;

      return cookie;
    });

    return cb(null, serialized);
  });
};

// well-known name that JSON.stringify calls
CookieJar.prototype.toJSON = function() {
  return this.serializeSync();
};

// use the class method CookieJar.deserialize instead of calling this directly
CAN_BE_SYNC.push('_importCookies');
CookieJar.prototype._importCookies = function(serialized, cb) {
  var jar = this;
  var cookies = serialized.cookies;
  if (!cookies || !Array.isArray(cookies)) {
    return cb(new Error('serialized jar has no cookies array'));
  }

  function putNext(err) {
    if (err) {
      return cb(err);
    }

    if (!cookies.length) {
      return cb(err, jar);
    }

    var cookie;
    try {
      cookie = fromJSON(cookies.shift());
    } catch (e) {
      return cb(e);
    }

    if (cookie === null) {
      return putNext(null); // skip this cookie
    }

    jar.store.putCookie(cookie, putNext);
  }

  putNext();
};

CookieJar.deserialize = function(strOrObj, store, cb) {
  if (arguments.length !== 3) {
    // store is optional
    cb = store;
    store = null;
  }

  var serialized;
  if (typeof strOrObj === 'string') {
    serialized = jsonParse(strOrObj);
    if (serialized instanceof Error) {
      return cb(serialized);
    }
  } else {
    serialized = strOrObj;
  }

  var jar = new CookieJar(store, serialized.rejectPublicSuffixes);
  jar._importCookies(serialized, function(err) {
    if (err) {
      return cb(err);
    }
    cb(null, jar);
  });
};

CookieJar.fromJSON = CookieJar.deserializeSync;
CookieJar.deserializeSync = function(strOrObj, store) {
  var serialized = typeof strOrObj === 'string' ?
    JSON.parse(strOrObj) : strOrObj;
  var jar = new CookieJar(store, serialized.rejectPublicSuffixes);

  // catch this mistake early:
  if (!jar.store.synchronous) {
    throw new Error('CookieJar store is not synchronous; use async API instead.');
  }

  jar._importCookiesSync(serialized);
  return jar;
};

CAN_BE_SYNC.push('clone');
CookieJar.prototype.clone = function(newStore, cb) {
  if (arguments.length === 1) {
    cb = newStore;
    newStore = null;
  }

  this.serialize(function(err,serialized) {
    if (err) {
      return cb(err);
    }
    CookieJar.deserialize(newStore, serialized, cb);
  });
};

// Use a closure to provide a true imperative API for synchronous stores.
function syncWrap(method) {
  return function() {
    if (!this.store.synchronous) {
      throw new Error('CookieJar store is not synchronous; use async API instead.');
    }

    var args = Array.prototype.slice.call(arguments);
    var syncErr, syncResult;
    args.push(function syncCb(err, result) {
      syncErr = err;
      syncResult = result;
    });
    this[method].apply(this, args);

    if (syncErr) {
      throw syncErr;
    }
    return syncResult;
  };
}

// wrap all declared CAN_BE_SYNC methods in the sync wrapper
CAN_BE_SYNC.forEach(function(method) {
  CookieJar.prototype[method+'Sync'] = syncWrap(method);
});

module.exports = {
  CookieJar: CookieJar,
  Cookie: Cookie,
  Store: Store,
  MemoryCookieStore: MemoryCookieStore,
  parseDate: parseDate,
  formatDate: formatDate,
  parse: parse,
  fromJSON: fromJSON,
  domainMatch: domainMatch,
  defaultPath: defaultPath,
  pathMatch: pathMatch,
  getPublicSuffix: pubsuffix.getPublicSuffix,
  cookieCompare: cookieCompare,
  permuteDomain: require('./permuteDomain').permuteDomain,
  permutePath: permutePath,
  canonicalDomain: canonicalDomain
};

},{"../package.json":109,"./memstore":104,"./pathMatch":105,"./permuteDomain":106,"./pubsuffix":107,"./store":108,"net":undefined,"punycode":undefined,"url":undefined}],104:[function(require,module,exports){
/*!
 * Copyright (c) 2015, Salesforce.com, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Salesforce.com nor the names of its contributors may
 * be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
'use strict';
var Store = require('./store').Store;
var permuteDomain = require('./permuteDomain').permuteDomain;
var pathMatch = require('./pathMatch').pathMatch;
var util = require('util');

function MemoryCookieStore() {
  Store.call(this);
  this.idx = {};
}
util.inherits(MemoryCookieStore, Store);
exports.MemoryCookieStore = MemoryCookieStore;
MemoryCookieStore.prototype.idx = null;

// Since it's just a struct in RAM, this Store is synchronous
MemoryCookieStore.prototype.synchronous = true;

// force a default depth:
MemoryCookieStore.prototype.inspect = function() {
  return "{ idx: "+util.inspect(this.idx, false, 2)+' }';
};

MemoryCookieStore.prototype.findCookie = function(domain, path, key, cb) {
  if (!this.idx[domain]) {
    return cb(null,undefined);
  }
  if (!this.idx[domain][path]) {
    return cb(null,undefined);
  }
  return cb(null,this.idx[domain][path][key]||null);
};

MemoryCookieStore.prototype.findCookies = function(domain, path, cb) {
  var results = [];
  if (!domain) {
    return cb(null,[]);
  }

  var pathMatcher;
  if (!path) {
    // null means "all paths"
    pathMatcher = function matchAll(domainIndex) {
      for (var curPath in domainIndex) {
        var pathIndex = domainIndex[curPath];
        for (var key in pathIndex) {
          results.push(pathIndex[key]);
        }
      }
    };

  } else {
    pathMatcher = function matchRFC(domainIndex) {
       //NOTE: we should use path-match algorithm from S5.1.4 here
       //(see : https://github.com/ChromiumWebApps/chromium/blob/b3d3b4da8bb94c1b2e061600df106d590fda3620/net/cookies/canonical_cookie.cc#L299)
       Object.keys(domainIndex).forEach(function (cookiePath) {
         if (pathMatch(path, cookiePath)) {
           var pathIndex = domainIndex[cookiePath];

           for (var key in pathIndex) {
             results.push(pathIndex[key]);
           }
         }
       });
     };
  }

  var domains = permuteDomain(domain) || [domain];
  var idx = this.idx;
  domains.forEach(function(curDomain) {
    var domainIndex = idx[curDomain];
    if (!domainIndex) {
      return;
    }
    pathMatcher(domainIndex);
  });

  cb(null,results);
};

MemoryCookieStore.prototype.putCookie = function(cookie, cb) {
  if (!this.idx[cookie.domain]) {
    this.idx[cookie.domain] = {};
  }
  if (!this.idx[cookie.domain][cookie.path]) {
    this.idx[cookie.domain][cookie.path] = {};
  }
  this.idx[cookie.domain][cookie.path][cookie.key] = cookie;
  cb(null);
};

MemoryCookieStore.prototype.updateCookie = function(oldCookie, newCookie, cb) {
  // updateCookie() may avoid updating cookies that are identical.  For example,
  // lastAccessed may not be important to some stores and an equality
  // comparison could exclude that field.
  this.putCookie(newCookie,cb);
};

MemoryCookieStore.prototype.removeCookie = function(domain, path, key, cb) {
  if (this.idx[domain] && this.idx[domain][path] && this.idx[domain][path][key]) {
    delete this.idx[domain][path][key];
  }
  cb(null);
};

MemoryCookieStore.prototype.removeCookies = function(domain, path, cb) {
  if (this.idx[domain]) {
    if (path) {
      delete this.idx[domain][path];
    } else {
      delete this.idx[domain];
    }
  }
  return cb(null);
};

MemoryCookieStore.prototype.getAllCookies = function(cb) {
  var cookies = [];
  var idx = this.idx;

  var domains = Object.keys(idx);
  domains.forEach(function(domain) {
    var paths = Object.keys(idx[domain]);
    paths.forEach(function(path) {
      var keys = Object.keys(idx[domain][path]);
      keys.forEach(function(key) {
        if (key !== null) {
          cookies.push(idx[domain][path][key]);
        }
      });
    });
  });

  // Sort by creationIndex so deserializing retains the creation order.
  // When implementing your own store, this SHOULD retain the order too
  cookies.sort(function(a,b) {
    return (a.creationIndex||0) - (b.creationIndex||0);
  });

  cb(null, cookies);
};

},{"./pathMatch":105,"./permuteDomain":106,"./store":108,"util":undefined}],105:[function(require,module,exports){
/*!
 * Copyright (c) 2015, Salesforce.com, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Salesforce.com nor the names of its contributors may
 * be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";
/*
 * "A request-path path-matches a given cookie-path if at least one of the
 * following conditions holds:"
 */
function pathMatch (reqPath, cookiePath) {
  // "o  The cookie-path and the request-path are identical."
  if (cookiePath === reqPath) {
    return true;
  }

  var idx = reqPath.indexOf(cookiePath);
  if (idx === 0) {
    // "o  The cookie-path is a prefix of the request-path, and the last
    // character of the cookie-path is %x2F ("/")."
    if (cookiePath.substr(-1) === "/") {
      return true;
    }

    // " o  The cookie-path is a prefix of the request-path, and the first
    // character of the request-path that is not included in the cookie- path
    // is a %x2F ("/") character."
    if (reqPath.substr(cookiePath.length, 1) === "/") {
      return true;
    }
  }

  return false;
}

exports.pathMatch = pathMatch;

},{}],106:[function(require,module,exports){
/*!
 * Copyright (c) 2015, Salesforce.com, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Salesforce.com nor the names of its contributors may
 * be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";
var pubsuffix = require('./pubsuffix');

// Gives the permutation of all possible domainMatch()es of a given domain. The
// array is in shortest-to-longest order.  Handy for indexing.
function permuteDomain (domain) {
  var pubSuf = pubsuffix.getPublicSuffix(domain);
  if (!pubSuf) {
    return null;
  }
  if (pubSuf == domain) {
    return [domain];
  }

  var prefix = domain.slice(0, -(pubSuf.length + 1)); // ".example.com"
  var parts = prefix.split('.').reverse();
  var cur = pubSuf;
  var permutations = [cur];
  while (parts.length) {
    cur = parts.shift() + '.' + cur;
    permutations.push(cur);
  }
  return permutations;
}

exports.permuteDomain = permuteDomain;

},{"./pubsuffix":107}],107:[function(require,module,exports){
/****************************************************
 * AUTOMATICALLY GENERATED by generate-pubsuffix.js *
 *                  DO NOT EDIT!                    *
 ****************************************************/

"use strict";

var punycode = require('punycode');

module.exports.getPublicSuffix = function getPublicSuffix(domain) {
  /*!
   * Copyright (c) 2015, Salesforce.com, Inc.
   * All rights reserved.
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice,
   * this list of conditions and the following disclaimer.
   *
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   * this list of conditions and the following disclaimer in the documentation
   * and/or other materials provided with the distribution.
   *
   * 3. Neither the name of Salesforce.com nor the names of its contributors may
   * be used to endorse or promote products derived from this software without
   * specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
   * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
   * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
   * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
   * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
   * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
   * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
   * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
   * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
   * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
   * POSSIBILITY OF SUCH DAMAGE.
   */
  if (!domain) {
    return null;
  }
  if (domain.match(/^\./)) {
    return null;
  }
  var asciiDomain = punycode.toASCII(domain);
  var converted = false;
  if (asciiDomain !== domain) {
    domain = asciiDomain;
    converted = true;
  }
  if (index[domain]) {
    return null;
  }

  domain = domain.toLowerCase();
  var parts = domain.split('.').reverse();

  var suffix = '';
  var suffixLen = 0;
  for (var i=0; i<parts.length; i++) {
    var part = parts[i];
    var starstr = '*'+suffix;
    var partstr = part+suffix;

    if (index[starstr]) { // star rule matches
      suffixLen = i+1;
      if (index[partstr] === false) { // exception rule matches (NB: false, not undefined)
        suffixLen--;
      }
    } else if (index[partstr]) { // exact match, not exception
      suffixLen = i+1;
    }

    suffix = '.'+partstr;
  }

  if (index['*'+suffix]) { // *.domain exists (e.g. *.kyoto.jp for domain='kyoto.jp');
    return null;
  }

  suffixLen = suffixLen || 1;
  if (parts.length > suffixLen) {
    var publicSuffix = parts.slice(0,suffixLen+1).reverse().join('.');
    return converted ? punycode.toUnicode(publicSuffix) : publicSuffix;
  }

  return null;
};

// The following generated structure is used under the MPL version 1.1
// See public-suffix.txt for more information

var index = module.exports.index = Object.freeze(
{"ac":true,"com.ac":true,"edu.ac":true,"gov.ac":true,"net.ac":true,"mil.ac":true,"org.ac":true,"ad":true,"nom.ad":true,"ae":true,"co.ae":true,"net.ae":true,"org.ae":true,"sch.ae":true,"ac.ae":true,"gov.ae":true,"mil.ae":true,"aero":true,"accident-investigation.aero":true,"accident-prevention.aero":true,"aerobatic.aero":true,"aeroclub.aero":true,"aerodrome.aero":true,"agents.aero":true,"aircraft.aero":true,"airline.aero":true,"airport.aero":true,"air-surveillance.aero":true,"airtraffic.aero":true,"air-traffic-control.aero":true,"ambulance.aero":true,"amusement.aero":true,"association.aero":true,"author.aero":true,"ballooning.aero":true,"broker.aero":true,"caa.aero":true,"cargo.aero":true,"catering.aero":true,"certification.aero":true,"championship.aero":true,"charter.aero":true,"civilaviation.aero":true,"club.aero":true,"conference.aero":true,"consultant.aero":true,"consulting.aero":true,"control.aero":true,"council.aero":true,"crew.aero":true,"design.aero":true,"dgca.aero":true,"educator.aero":true,"emergency.aero":true,"engine.aero":true,"engineer.aero":true,"entertainment.aero":true,"equipment.aero":true,"exchange.aero":true,"express.aero":true,"federation.aero":true,"flight.aero":true,"freight.aero":true,"fuel.aero":true,"gliding.aero":true,"government.aero":true,"groundhandling.aero":true,"group.aero":true,"hanggliding.aero":true,"homebuilt.aero":true,"insurance.aero":true,"journal.aero":true,"journalist.aero":true,"leasing.aero":true,"logistics.aero":true,"magazine.aero":true,"maintenance.aero":true,"marketplace.aero":true,"media.aero":true,"microlight.aero":true,"modelling.aero":true,"navigation.aero":true,"parachuting.aero":true,"paragliding.aero":true,"passenger-association.aero":true,"pilot.aero":true,"press.aero":true,"production.aero":true,"recreation.aero":true,"repbody.aero":true,"res.aero":true,"research.aero":true,"rotorcraft.aero":true,"safety.aero":true,"scientist.aero":true,"services.aero":true,"show.aero":true,"skydiving.aero":true,"software.aero":true,"student.aero":true,"taxi.aero":true,"trader.aero":true,"trading.aero":true,"trainer.aero":true,"union.aero":true,"workinggroup.aero":true,"works.aero":true,"af":true,"gov.af":true,"com.af":true,"org.af":true,"net.af":true,"edu.af":true,"ag":true,"com.ag":true,"org.ag":true,"net.ag":true,"co.ag":true,"nom.ag":true,"ai":true,"off.ai":true,"com.ai":true,"net.ai":true,"org.ai":true,"al":true,"com.al":true,"edu.al":true,"gov.al":true,"mil.al":true,"net.al":true,"org.al":true,"am":true,"an":true,"com.an":true,"net.an":true,"org.an":true,"edu.an":true,"ao":true,"ed.ao":true,"gv.ao":true,"og.ao":true,"co.ao":true,"pb.ao":true,"it.ao":true,"aq":true,"ar":true,"com.ar":true,"edu.ar":true,"gob.ar":true,"gov.ar":true,"int.ar":true,"mil.ar":true,"net.ar":true,"org.ar":true,"tur.ar":true,"arpa":true,"e164.arpa":true,"in-addr.arpa":true,"ip6.arpa":true,"iris.arpa":true,"uri.arpa":true,"urn.arpa":true,"as":true,"gov.as":true,"asia":true,"at":true,"ac.at":true,"co.at":true,"gv.at":true,"or.at":true,"au":true,"com.au":true,"net.au":true,"org.au":true,"edu.au":true,"gov.au":true,"asn.au":true,"id.au":true,"info.au":true,"conf.au":true,"oz.au":true,"act.au":true,"nsw.au":true,"nt.au":true,"qld.au":true,"sa.au":true,"tas.au":true,"vic.au":true,"wa.au":true,"act.edu.au":true,"nsw.edu.au":true,"nt.edu.au":true,"qld.edu.au":true,"sa.edu.au":true,"tas.edu.au":true,"vic.edu.au":true,"wa.edu.au":true,"qld.gov.au":true,"sa.gov.au":true,"tas.gov.au":true,"vic.gov.au":true,"wa.gov.au":true,"aw":true,"com.aw":true,"ax":true,"az":true,"com.az":true,"net.az":true,"int.az":true,"gov.az":true,"org.az":true,"edu.az":true,"info.az":true,"pp.az":true,"mil.az":true,"name.az":true,"pro.az":true,"biz.az":true,"ba":true,"org.ba":true,"net.ba":true,"edu.ba":true,"gov.ba":true,"mil.ba":true,"unsa.ba":true,"unbi.ba":true,"co.ba":true,"com.ba":true,"rs.ba":true,"bb":true,"biz.bb":true,"co.bb":true,"com.bb":true,"edu.bb":true,"gov.bb":true,"info.bb":true,"net.bb":true,"org.bb":true,"store.bb":true,"tv.bb":true,"*.bd":true,"be":true,"ac.be":true,"bf":true,"gov.bf":true,"bg":true,"a.bg":true,"b.bg":true,"c.bg":true,"d.bg":true,"e.bg":true,"f.bg":true,"g.bg":true,"h.bg":true,"i.bg":true,"j.bg":true,"k.bg":true,"l.bg":true,"m.bg":true,"n.bg":true,"o.bg":true,"p.bg":true,"q.bg":true,"r.bg":true,"s.bg":true,"t.bg":true,"u.bg":true,"v.bg":true,"w.bg":true,"x.bg":true,"y.bg":true,"z.bg":true,"0.bg":true,"1.bg":true,"2.bg":true,"3.bg":true,"4.bg":true,"5.bg":true,"6.bg":true,"7.bg":true,"8.bg":true,"9.bg":true,"bh":true,"com.bh":true,"edu.bh":true,"net.bh":true,"org.bh":true,"gov.bh":true,"bi":true,"co.bi":true,"com.bi":true,"edu.bi":true,"or.bi":true,"org.bi":true,"biz":true,"bj":true,"asso.bj":true,"barreau.bj":true,"gouv.bj":true,"bm":true,"com.bm":true,"edu.bm":true,"gov.bm":true,"net.bm":true,"org.bm":true,"*.bn":true,"bo":true,"com.bo":true,"edu.bo":true,"gov.bo":true,"gob.bo":true,"int.bo":true,"org.bo":true,"net.bo":true,"mil.bo":true,"tv.bo":true,"br":true,"adm.br":true,"adv.br":true,"agr.br":true,"am.br":true,"arq.br":true,"art.br":true,"ato.br":true,"b.br":true,"bio.br":true,"blog.br":true,"bmd.br":true,"cim.br":true,"cng.br":true,"cnt.br":true,"com.br":true,"coop.br":true,"ecn.br":true,"eco.br":true,"edu.br":true,"emp.br":true,"eng.br":true,"esp.br":true,"etc.br":true,"eti.br":true,"far.br":true,"flog.br":true,"fm.br":true,"fnd.br":true,"fot.br":true,"fst.br":true,"g12.br":true,"ggf.br":true,"gov.br":true,"imb.br":true,"ind.br":true,"inf.br":true,"jor.br":true,"jus.br":true,"leg.br":true,"lel.br":true,"mat.br":true,"med.br":true,"mil.br":true,"mp.br":true,"mus.br":true,"net.br":true,"*.nom.br":true,"not.br":true,"ntr.br":true,"odo.br":true,"org.br":true,"ppg.br":true,"pro.br":true,"psc.br":true,"psi.br":true,"qsl.br":true,"radio.br":true,"rec.br":true,"slg.br":true,"srv.br":true,"taxi.br":true,"teo.br":true,"tmp.br":true,"trd.br":true,"tur.br":true,"tv.br":true,"vet.br":true,"vlog.br":true,"wiki.br":true,"zlg.br":true,"bs":true,"com.bs":true,"net.bs":true,"org.bs":true,"edu.bs":true,"gov.bs":true,"bt":true,"com.bt":true,"edu.bt":true,"gov.bt":true,"net.bt":true,"org.bt":true,"bv":true,"bw":true,"co.bw":true,"org.bw":true,"by":true,"gov.by":true,"mil.by":true,"com.by":true,"of.by":true,"bz":true,"com.bz":true,"net.bz":true,"org.bz":true,"edu.bz":true,"gov.bz":true,"ca":true,"ab.ca":true,"bc.ca":true,"mb.ca":true,"nb.ca":true,"nf.ca":true,"nl.ca":true,"ns.ca":true,"nt.ca":true,"nu.ca":true,"on.ca":true,"pe.ca":true,"qc.ca":true,"sk.ca":true,"yk.ca":true,"gc.ca":true,"cat":true,"cc":true,"cd":true,"gov.cd":true,"cf":true,"cg":true,"ch":true,"ci":true,"org.ci":true,"or.ci":true,"com.ci":true,"co.ci":true,"edu.ci":true,"ed.ci":true,"ac.ci":true,"net.ci":true,"go.ci":true,"asso.ci":true,"xn--aroport-bya.ci":true,"int.ci":true,"presse.ci":true,"md.ci":true,"gouv.ci":true,"*.ck":true,"www.ck":false,"cl":true,"gov.cl":true,"gob.cl":true,"co.cl":true,"mil.cl":true,"cm":true,"co.cm":true,"com.cm":true,"gov.cm":true,"net.cm":true,"cn":true,"ac.cn":true,"com.cn":true,"edu.cn":true,"gov.cn":true,"net.cn":true,"org.cn":true,"mil.cn":true,"xn--55qx5d.cn":true,"xn--io0a7i.cn":true,"xn--od0alg.cn":true,"ah.cn":true,"bj.cn":true,"cq.cn":true,"fj.cn":true,"gd.cn":true,"gs.cn":true,"gz.cn":true,"gx.cn":true,"ha.cn":true,"hb.cn":true,"he.cn":true,"hi.cn":true,"hl.cn":true,"hn.cn":true,"jl.cn":true,"js.cn":true,"jx.cn":true,"ln.cn":true,"nm.cn":true,"nx.cn":true,"qh.cn":true,"sc.cn":true,"sd.cn":true,"sh.cn":true,"sn.cn":true,"sx.cn":true,"tj.cn":true,"xj.cn":true,"xz.cn":true,"yn.cn":true,"zj.cn":true,"hk.cn":true,"mo.cn":true,"tw.cn":true,"co":true,"arts.co":true,"com.co":true,"edu.co":true,"firm.co":true,"gov.co":true,"info.co":true,"int.co":true,"mil.co":true,"net.co":true,"nom.co":true,"org.co":true,"rec.co":true,"web.co":true,"com":true,"coop":true,"cr":true,"ac.cr":true,"co.cr":true,"ed.cr":true,"fi.cr":true,"go.cr":true,"or.cr":true,"sa.cr":true,"cu":true,"com.cu":true,"edu.cu":true,"org.cu":true,"net.cu":true,"gov.cu":true,"inf.cu":true,"cv":true,"cw":true,"com.cw":true,"edu.cw":true,"net.cw":true,"org.cw":true,"cx":true,"gov.cx":true,"*.cy":true,"cz":true,"de":true,"dj":true,"dk":true,"dm":true,"com.dm":true,"net.dm":true,"org.dm":true,"edu.dm":true,"gov.dm":true,"do":true,"art.do":true,"com.do":true,"edu.do":true,"gob.do":true,"gov.do":true,"mil.do":true,"net.do":true,"org.do":true,"sld.do":true,"web.do":true,"dz":true,"com.dz":true,"org.dz":true,"net.dz":true,"gov.dz":true,"edu.dz":true,"asso.dz":true,"pol.dz":true,"art.dz":true,"ec":true,"com.ec":true,"info.ec":true,"net.ec":true,"fin.ec":true,"k12.ec":true,"med.ec":true,"pro.ec":true,"org.ec":true,"edu.ec":true,"gov.ec":true,"gob.ec":true,"mil.ec":true,"edu":true,"ee":true,"edu.ee":true,"gov.ee":true,"riik.ee":true,"lib.ee":true,"med.ee":true,"com.ee":true,"pri.ee":true,"aip.ee":true,"org.ee":true,"fie.ee":true,"eg":true,"com.eg":true,"edu.eg":true,"eun.eg":true,"gov.eg":true,"mil.eg":true,"name.eg":true,"net.eg":true,"org.eg":true,"sci.eg":true,"*.er":true,"es":true,"com.es":true,"nom.es":true,"org.es":true,"gob.es":true,"edu.es":true,"et":true,"com.et":true,"gov.et":true,"org.et":true,"edu.et":true,"biz.et":true,"name.et":true,"info.et":true,"eu":true,"fi":true,"aland.fi":true,"*.fj":true,"*.fk":true,"fm":true,"fo":true,"fr":true,"com.fr":true,"asso.fr":true,"nom.fr":true,"prd.fr":true,"presse.fr":true,"tm.fr":true,"aeroport.fr":true,"assedic.fr":true,"avocat.fr":true,"avoues.fr":true,"cci.fr":true,"chambagri.fr":true,"chirurgiens-dentistes.fr":true,"experts-comptables.fr":true,"geometre-expert.fr":true,"gouv.fr":true,"greta.fr":true,"huissier-justice.fr":true,"medecin.fr":true,"notaires.fr":true,"pharmacien.fr":true,"port.fr":true,"veterinaire.fr":true,"ga":true,"gb":true,"gd":true,"ge":true,"com.ge":true,"edu.ge":true,"gov.ge":true,"org.ge":true,"mil.ge":true,"net.ge":true,"pvt.ge":true,"gf":true,"gg":true,"co.gg":true,"net.gg":true,"org.gg":true,"gh":true,"com.gh":true,"edu.gh":true,"gov.gh":true,"org.gh":true,"mil.gh":true,"gi":true,"com.gi":true,"ltd.gi":true,"gov.gi":true,"mod.gi":true,"edu.gi":true,"org.gi":true,"gl":true,"gm":true,"gn":true,"ac.gn":true,"com.gn":true,"edu.gn":true,"gov.gn":true,"org.gn":true,"net.gn":true,"gov":true,"gp":true,"com.gp":true,"net.gp":true,"mobi.gp":true,"edu.gp":true,"org.gp":true,"asso.gp":true,"gq":true,"gr":true,"com.gr":true,"edu.gr":true,"net.gr":true,"org.gr":true,"gov.gr":true,"gs":true,"gt":true,"com.gt":true,"edu.gt":true,"gob.gt":true,"ind.gt":true,"mil.gt":true,"net.gt":true,"org.gt":true,"*.gu":true,"gw":true,"gy":true,"co.gy":true,"com.gy":true,"net.gy":true,"hk":true,"com.hk":true,"edu.hk":true,"gov.hk":true,"idv.hk":true,"net.hk":true,"org.hk":true,"xn--55qx5d.hk":true,"xn--wcvs22d.hk":true,"xn--lcvr32d.hk":true,"xn--mxtq1m.hk":true,"xn--gmqw5a.hk":true,"xn--ciqpn.hk":true,"xn--gmq050i.hk":true,"xn--zf0avx.hk":true,"xn--io0a7i.hk":true,"xn--mk0axi.hk":true,"xn--od0alg.hk":true,"xn--od0aq3b.hk":true,"xn--tn0ag.hk":true,"xn--uc0atv.hk":true,"xn--uc0ay4a.hk":true,"hm":true,"hn":true,"com.hn":true,"edu.hn":true,"org.hn":true,"net.hn":true,"mil.hn":true,"gob.hn":true,"hr":true,"iz.hr":true,"from.hr":true,"name.hr":true,"com.hr":true,"ht":true,"com.ht":true,"shop.ht":true,"firm.ht":true,"info.ht":true,"adult.ht":true,"net.ht":true,"pro.ht":true,"org.ht":true,"med.ht":true,"art.ht":true,"coop.ht":true,"pol.ht":true,"asso.ht":true,"edu.ht":true,"rel.ht":true,"gouv.ht":true,"perso.ht":true,"hu":true,"co.hu":true,"info.hu":true,"org.hu":true,"priv.hu":true,"sport.hu":true,"tm.hu":true,"2000.hu":true,"agrar.hu":true,"bolt.hu":true,"casino.hu":true,"city.hu":true,"erotica.hu":true,"erotika.hu":true,"film.hu":true,"forum.hu":true,"games.hu":true,"hotel.hu":true,"ingatlan.hu":true,"jogasz.hu":true,"konyvelo.hu":true,"lakas.hu":true,"media.hu":true,"news.hu":true,"reklam.hu":true,"sex.hu":true,"shop.hu":true,"suli.hu":true,"szex.hu":true,"tozsde.hu":true,"utazas.hu":true,"video.hu":true,"id":true,"ac.id":true,"biz.id":true,"co.id":true,"desa.id":true,"go.id":true,"mil.id":true,"my.id":true,"net.id":true,"or.id":true,"sch.id":true,"web.id":true,"ie":true,"gov.ie":true,"*.il":true,"im":true,"ac.im":true,"co.im":true,"com.im":true,"ltd.co.im":true,"net.im":true,"org.im":true,"plc.co.im":true,"tt.im":true,"tv.im":true,"in":true,"co.in":true,"firm.in":true,"net.in":true,"org.in":true,"gen.in":true,"ind.in":true,"nic.in":true,"ac.in":true,"edu.in":true,"res.in":true,"gov.in":true,"mil.in":true,"info":true,"int":true,"eu.int":true,"io":true,"com.io":true,"iq":true,"gov.iq":true,"edu.iq":true,"mil.iq":true,"com.iq":true,"org.iq":true,"net.iq":true,"ir":true,"ac.ir":true,"co.ir":true,"gov.ir":true,"id.ir":true,"net.ir":true,"org.ir":true,"sch.ir":true,"xn--mgba3a4f16a.ir":true,"xn--mgba3a4fra.ir":true,"is":true,"net.is":true,"com.is":true,"edu.is":true,"gov.is":true,"org.is":true,"int.is":true,"it":true,"gov.it":true,"edu.it":true,"abr.it":true,"abruzzo.it":true,"aosta-valley.it":true,"aostavalley.it":true,"bas.it":true,"basilicata.it":true,"cal.it":true,"calabria.it":true,"cam.it":true,"campania.it":true,"emilia-romagna.it":true,"emiliaromagna.it":true,"emr.it":true,"friuli-v-giulia.it":true,"friuli-ve-giulia.it":true,"friuli-vegiulia.it":true,"friuli-venezia-giulia.it":true,"friuli-veneziagiulia.it":true,"friuli-vgiulia.it":true,"friuliv-giulia.it":true,"friulive-giulia.it":true,"friulivegiulia.it":true,"friulivenezia-giulia.it":true,"friuliveneziagiulia.it":true,"friulivgiulia.it":true,"fvg.it":true,"laz.it":true,"lazio.it":true,"lig.it":true,"liguria.it":true,"lom.it":true,"lombardia.it":true,"lombardy.it":true,"lucania.it":true,"mar.it":true,"marche.it":true,"mol.it":true,"molise.it":true,"piedmont.it":true,"piemonte.it":true,"pmn.it":true,"pug.it":true,"puglia.it":true,"sar.it":true,"sardegna.it":true,"sardinia.it":true,"sic.it":true,"sicilia.it":true,"sicily.it":true,"taa.it":true,"tos.it":true,"toscana.it":true,"trentino-a-adige.it":true,"trentino-aadige.it":true,"trentino-alto-adige.it":true,"trentino-altoadige.it":true,"trentino-s-tirol.it":true,"trentino-stirol.it":true,"trentino-sud-tirol.it":true,"trentino-sudtirol.it":true,"trentino-sued-tirol.it":true,"trentino-suedtirol.it":true,"trentinoa-adige.it":true,"trentinoaadige.it":true,"trentinoalto-adige.it":true,"trentinoaltoadige.it":true,"trentinos-tirol.it":true,"trentinostirol.it":true,"trentinosud-tirol.it":true,"trentinosudtirol.it":true,"trentinosued-tirol.it":true,"trentinosuedtirol.it":true,"tuscany.it":true,"umb.it":true,"umbria.it":true,"val-d-aosta.it":true,"val-daosta.it":true,"vald-aosta.it":true,"valdaosta.it":true,"valle-aosta.it":true,"valle-d-aosta.it":true,"valle-daosta.it":true,"valleaosta.it":true,"valled-aosta.it":true,"valledaosta.it":true,"vallee-aoste.it":true,"valleeaoste.it":true,"vao.it":true,"vda.it":true,"ven.it":true,"veneto.it":true,"ag.it":true,"agrigento.it":true,"al.it":true,"alessandria.it":true,"alto-adige.it":true,"altoadige.it":true,"an.it":true,"ancona.it":true,"andria-barletta-trani.it":true,"andria-trani-barletta.it":true,"andriabarlettatrani.it":true,"andriatranibarletta.it":true,"ao.it":true,"aosta.it":true,"aoste.it":true,"ap.it":true,"aq.it":true,"aquila.it":true,"ar.it":true,"arezzo.it":true,"ascoli-piceno.it":true,"ascolipiceno.it":true,"asti.it":true,"at.it":true,"av.it":true,"avellino.it":true,"ba.it":true,"balsan.it":true,"bari.it":true,"barletta-trani-andria.it":true,"barlettatraniandria.it":true,"belluno.it":true,"benevento.it":true,"bergamo.it":true,"bg.it":true,"bi.it":true,"biella.it":true,"bl.it":true,"bn.it":true,"bo.it":true,"bologna.it":true,"bolzano.it":true,"bozen.it":true,"br.it":true,"brescia.it":true,"brindisi.it":true,"bs.it":true,"bt.it":true,"bz.it":true,"ca.it":true,"cagliari.it":true,"caltanissetta.it":true,"campidano-medio.it":true,"campidanomedio.it":true,"campobasso.it":true,"carbonia-iglesias.it":true,"carboniaiglesias.it":true,"carrara-massa.it":true,"carraramassa.it":true,"caserta.it":true,"catania.it":true,"catanzaro.it":true,"cb.it":true,"ce.it":true,"cesena-forli.it":true,"cesenaforli.it":true,"ch.it":true,"chieti.it":true,"ci.it":true,"cl.it":true,"cn.it":true,"co.it":true,"como.it":true,"cosenza.it":true,"cr.it":true,"cremona.it":true,"crotone.it":true,"cs.it":true,"ct.it":true,"cuneo.it":true,"cz.it":true,"dell-ogliastra.it":true,"dellogliastra.it":true,"en.it":true,"enna.it":true,"fc.it":true,"fe.it":true,"fermo.it":true,"ferrara.it":true,"fg.it":true,"fi.it":true,"firenze.it":true,"florence.it":true,"fm.it":true,"foggia.it":true,"forli-cesena.it":true,"forlicesena.it":true,"fr.it":true,"frosinone.it":true,"ge.it":true,"genoa.it":true,"genova.it":true,"go.it":true,"gorizia.it":true,"gr.it":true,"grosseto.it":true,"iglesias-carbonia.it":true,"iglesiascarbonia.it":true,"im.it":true,"imperia.it":true,"is.it":true,"isernia.it":true,"kr.it":true,"la-spezia.it":true,"laquila.it":true,"laspezia.it":true,"latina.it":true,"lc.it":true,"le.it":true,"lecce.it":true,"lecco.it":true,"li.it":true,"livorno.it":true,"lo.it":true,"lodi.it":true,"lt.it":true,"lu.it":true,"lucca.it":true,"macerata.it":true,"mantova.it":true,"massa-carrara.it":true,"massacarrara.it":true,"matera.it":true,"mb.it":true,"mc.it":true,"me.it":true,"medio-campidano.it":true,"mediocampidano.it":true,"messina.it":true,"mi.it":true,"milan.it":true,"milano.it":true,"mn.it":true,"mo.it":true,"modena.it":true,"monza-brianza.it":true,"monza-e-della-brianza.it":true,"monza.it":true,"monzabrianza.it":true,"monzaebrianza.it":true,"monzaedellabrianza.it":true,"ms.it":true,"mt.it":true,"na.it":true,"naples.it":true,"napoli.it":true,"no.it":true,"novara.it":true,"nu.it":true,"nuoro.it":true,"og.it":true,"ogliastra.it":true,"olbia-tempio.it":true,"olbiatempio.it":true,"or.it":true,"oristano.it":true,"ot.it":true,"pa.it":true,"padova.it":true,"padua.it":true,"palermo.it":true,"parma.it":true,"pavia.it":true,"pc.it":true,"pd.it":true,"pe.it":true,"perugia.it":true,"pesaro-urbino.it":true,"pesarourbino.it":true,"pescara.it":true,"pg.it":true,"pi.it":true,"piacenza.it":true,"pisa.it":true,"pistoia.it":true,"pn.it":true,"po.it":true,"pordenone.it":true,"potenza.it":true,"pr.it":true,"prato.it":true,"pt.it":true,"pu.it":true,"pv.it":true,"pz.it":true,"ra.it":true,"ragusa.it":true,"ravenna.it":true,"rc.it":true,"re.it":true,"reggio-calabria.it":true,"reggio-emilia.it":true,"reggiocalabria.it":true,"reggioemilia.it":true,"rg.it":true,"ri.it":true,"rieti.it":true,"rimini.it":true,"rm.it":true,"rn.it":true,"ro.it":true,"roma.it":true,"rome.it":true,"rovigo.it":true,"sa.it":true,"salerno.it":true,"sassari.it":true,"savona.it":true,"si.it":true,"siena.it":true,"siracusa.it":true,"so.it":true,"sondrio.it":true,"sp.it":true,"sr.it":true,"ss.it":true,"suedtirol.it":true,"sv.it":true,"ta.it":true,"taranto.it":true,"te.it":true,"tempio-olbia.it":true,"tempioolbia.it":true,"teramo.it":true,"terni.it":true,"tn.it":true,"to.it":true,"torino.it":true,"tp.it":true,"tr.it":true,"trani-andria-barletta.it":true,"trani-barletta-andria.it":true,"traniandriabarletta.it":true,"tranibarlettaandria.it":true,"trapani.it":true,"trentino.it":true,"trento.it":true,"treviso.it":true,"trieste.it":true,"ts.it":true,"turin.it":true,"tv.it":true,"ud.it":true,"udine.it":true,"urbino-pesaro.it":true,"urbinopesaro.it":true,"va.it":true,"varese.it":true,"vb.it":true,"vc.it":true,"ve.it":true,"venezia.it":true,"venice.it":true,"verbania.it":true,"vercelli.it":true,"verona.it":true,"vi.it":true,"vibo-valentia.it":true,"vibovalentia.it":true,"vicenza.it":true,"viterbo.it":true,"vr.it":true,"vs.it":true,"vt.it":true,"vv.it":true,"je":true,"co.je":true,"net.je":true,"org.je":true,"*.jm":true,"jo":true,"com.jo":true,"org.jo":true,"net.jo":true,"edu.jo":true,"sch.jo":true,"gov.jo":true,"mil.jo":true,"name.jo":true,"jobs":true,"jp":true,"ac.jp":true,"ad.jp":true,"co.jp":true,"ed.jp":true,"go.jp":true,"gr.jp":true,"lg.jp":true,"ne.jp":true,"or.jp":true,"aichi.jp":true,"akita.jp":true,"aomori.jp":true,"chiba.jp":true,"ehime.jp":true,"fukui.jp":true,"fukuoka.jp":true,"fukushima.jp":true,"gifu.jp":true,"gunma.jp":true,"hiroshima.jp":true,"hokkaido.jp":true,"hyogo.jp":true,"ibaraki.jp":true,"ishikawa.jp":true,"iwate.jp":true,"kagawa.jp":true,"kagoshima.jp":true,"kanagawa.jp":true,"kochi.jp":true,"kumamoto.jp":true,"kyoto.jp":true,"mie.jp":true,"miyagi.jp":true,"miyazaki.jp":true,"nagano.jp":true,"nagasaki.jp":true,"nara.jp":true,"niigata.jp":true,"oita.jp":true,"okayama.jp":true,"okinawa.jp":true,"osaka.jp":true,"saga.jp":true,"saitama.jp":true,"shiga.jp":true,"shimane.jp":true,"shizuoka.jp":true,"tochigi.jp":true,"tokushima.jp":true,"tokyo.jp":true,"tottori.jp":true,"toyama.jp":true,"wakayama.jp":true,"yamagata.jp":true,"yamaguchi.jp":true,"yamanashi.jp":true,"xn--4pvxs.jp":true,"xn--vgu402c.jp":true,"xn--c3s14m.jp":true,"xn--f6qx53a.jp":true,"xn--8pvr4u.jp":true,"xn--uist22h.jp":true,"xn--djrs72d6uy.jp":true,"xn--mkru45i.jp":true,"xn--0trq7p7nn.jp":true,"xn--8ltr62k.jp":true,"xn--2m4a15e.jp":true,"xn--efvn9s.jp":true,"xn--32vp30h.jp":true,"xn--4it797k.jp":true,"xn--1lqs71d.jp":true,"xn--5rtp49c.jp":true,"xn--5js045d.jp":true,"xn--ehqz56n.jp":true,"xn--1lqs03n.jp":true,"xn--qqqt11m.jp":true,"xn--kbrq7o.jp":true,"xn--pssu33l.jp":true,"xn--ntsq17g.jp":true,"xn--uisz3g.jp":true,"xn--6btw5a.jp":true,"xn--1ctwo.jp":true,"xn--6orx2r.jp":true,"xn--rht61e.jp":true,"xn--rht27z.jp":true,"xn--djty4k.jp":true,"xn--nit225k.jp":true,"xn--rht3d.jp":true,"xn--klty5x.jp":true,"xn--kltx9a.jp":true,"xn--kltp7d.jp":true,"xn--uuwu58a.jp":true,"xn--zbx025d.jp":true,"xn--ntso0iqx3a.jp":true,"xn--elqq16h.jp":true,"xn--4it168d.jp":true,"xn--klt787d.jp":true,"xn--rny31h.jp":true,"xn--7t0a264c.jp":true,"xn--5rtq34k.jp":true,"xn--k7yn95e.jp":true,"xn--tor131o.jp":true,"xn--d5qv7z876c.jp":true,"*.kawasaki.jp":true,"*.kitakyushu.jp":true,"*.kobe.jp":true,"*.nagoya.jp":true,"*.sapporo.jp":true,"*.sendai.jp":true,"*.yokohama.jp":true,"city.kawasaki.jp":false,"city.kitakyushu.jp":false,"city.kobe.jp":false,"city.nagoya.jp":false,"city.sapporo.jp":false,"city.sendai.jp":false,"city.yokohama.jp":false,"aisai.aichi.jp":true,"ama.aichi.jp":true,"anjo.aichi.jp":true,"asuke.aichi.jp":true,"chiryu.aichi.jp":true,"chita.aichi.jp":true,"fuso.aichi.jp":true,"gamagori.aichi.jp":true,"handa.aichi.jp":true,"hazu.aichi.jp":true,"hekinan.aichi.jp":true,"higashiura.aichi.jp":true,"ichinomiya.aichi.jp":true,"inazawa.aichi.jp":true,"inuyama.aichi.jp":true,"isshiki.aichi.jp":true,"iwakura.aichi.jp":true,"kanie.aichi.jp":true,"kariya.aichi.jp":true,"kasugai.aichi.jp":true,"kira.aichi.jp":true,"kiyosu.aichi.jp":true,"komaki.aichi.jp":true,"konan.aichi.jp":true,"kota.aichi.jp":true,"mihama.aichi.jp":true,"miyoshi.aichi.jp":true,"nishio.aichi.jp":true,"nisshin.aichi.jp":true,"obu.aichi.jp":true,"oguchi.aichi.jp":true,"oharu.aichi.jp":true,"okazaki.aichi.jp":true,"owariasahi.aichi.jp":true,"seto.aichi.jp":true,"shikatsu.aichi.jp":true,"shinshiro.aichi.jp":true,"shitara.aichi.jp":true,"tahara.aichi.jp":true,"takahama.aichi.jp":true,"tobishima.aichi.jp":true,"toei.aichi.jp":true,"togo.aichi.jp":true,"tokai.aichi.jp":true,"tokoname.aichi.jp":true,"toyoake.aichi.jp":true,"toyohashi.aichi.jp":true,"toyokawa.aichi.jp":true,"toyone.aichi.jp":true,"toyota.aichi.jp":true,"tsushima.aichi.jp":true,"yatomi.aichi.jp":true,"akita.akita.jp":true,"daisen.akita.jp":true,"fujisato.akita.jp":true,"gojome.akita.jp":true,"hachirogata.akita.jp":true,"happou.akita.jp":true,"higashinaruse.akita.jp":true,"honjo.akita.jp":true,"honjyo.akita.jp":true,"ikawa.akita.jp":true,"kamikoani.akita.jp":true,"kamioka.akita.jp":true,"katagami.akita.jp":true,"kazuno.akita.jp":true,"kitaakita.akita.jp":true,"kosaka.akita.jp":true,"kyowa.akita.jp":true,"misato.akita.jp":true,"mitane.akita.jp":true,"moriyoshi.akita.jp":true,"nikaho.akita.jp":true,"noshiro.akita.jp":true,"odate.akita.jp":true,"oga.akita.jp":true,"ogata.akita.jp":true,"semboku.akita.jp":true,"yokote.akita.jp":true,"yurihonjo.akita.jp":true,"aomori.aomori.jp":true,"gonohe.aomori.jp":true,"hachinohe.aomori.jp":true,"hashikami.aomori.jp":true,"hiranai.aomori.jp":true,"hirosaki.aomori.jp":true,"itayanagi.aomori.jp":true,"kuroishi.aomori.jp":true,"misawa.aomori.jp":true,"mutsu.aomori.jp":true,"nakadomari.aomori.jp":true,"noheji.aomori.jp":true,"oirase.aomori.jp":true,"owani.aomori.jp":true,"rokunohe.aomori.jp":true,"sannohe.aomori.jp":true,"shichinohe.aomori.jp":true,"shingo.aomori.jp":true,"takko.aomori.jp":true,"towada.aomori.jp":true,"tsugaru.aomori.jp":true,"tsuruta.aomori.jp":true,"abiko.chiba.jp":true,"asahi.chiba.jp":true,"chonan.chiba.jp":true,"chosei.chiba.jp":true,"choshi.chiba.jp":true,"chuo.chiba.jp":true,"funabashi.chiba.jp":true,"futtsu.chiba.jp":true,"hanamigawa.chiba.jp":true,"ichihara.chiba.jp":true,"ichikawa.chiba.jp":true,"ichinomiya.chiba.jp":true,"inzai.chiba.jp":true,"isumi.chiba.jp":true,"kamagaya.chiba.jp":true,"kamogawa.chiba.jp":true,"kashiwa.chiba.jp":true,"katori.chiba.jp":true,"katsuura.chiba.jp":true,"kimitsu.chiba.jp":true,"kisarazu.chiba.jp":true,"kozaki.chiba.jp":true,"kujukuri.chiba.jp":true,"kyonan.chiba.jp":true,"matsudo.chiba.jp":true,"midori.chiba.jp":true,"mihama.chiba.jp":true,"minamiboso.chiba.jp":true,"mobara.chiba.jp":true,"mutsuzawa.chiba.jp":true,"nagara.chiba.jp":true,"nagareyama.chiba.jp":true,"narashino.chiba.jp":true,"narita.chiba.jp":true,"noda.chiba.jp":true,"oamishirasato.chiba.jp":true,"omigawa.chiba.jp":true,"onjuku.chiba.jp":true,"otaki.chiba.jp":true,"sakae.chiba.jp":true,"sakura.chiba.jp":true,"shimofusa.chiba.jp":true,"shirako.chiba.jp":true,"shiroi.chiba.jp":true,"shisui.chiba.jp":true,"sodegaura.chiba.jp":true,"sosa.chiba.jp":true,"tako.chiba.jp":true,"tateyama.chiba.jp":true,"togane.chiba.jp":true,"tohnosho.chiba.jp":true,"tomisato.chiba.jp":true,"urayasu.chiba.jp":true,"yachimata.chiba.jp":true,"yachiyo.chiba.jp":true,"yokaichiba.chiba.jp":true,"yokoshibahikari.chiba.jp":true,"yotsukaido.chiba.jp":true,"ainan.ehime.jp":true,"honai.ehime.jp":true,"ikata.ehime.jp":true,"imabari.ehime.jp":true,"iyo.ehime.jp":true,"kamijima.ehime.jp":true,"kihoku.ehime.jp":true,"kumakogen.ehime.jp":true,"masaki.ehime.jp":true,"matsuno.ehime.jp":true,"matsuyama.ehime.jp":true,"namikata.ehime.jp":true,"niihama.ehime.jp":true,"ozu.ehime.jp":true,"saijo.ehime.jp":true,"seiyo.ehime.jp":true,"shikokuchuo.ehime.jp":true,"tobe.ehime.jp":true,"toon.ehime.jp":true,"uchiko.ehime.jp":true,"uwajima.ehime.jp":true,"yawatahama.ehime.jp":true,"echizen.fukui.jp":true,"eiheiji.fukui.jp":true,"fukui.fukui.jp":true,"ikeda.fukui.jp":true,"katsuyama.fukui.jp":true,"mihama.fukui.jp":true,"minamiechizen.fukui.jp":true,"obama.fukui.jp":true,"ohi.fukui.jp":true,"ono.fukui.jp":true,"sabae.fukui.jp":true,"sakai.fukui.jp":true,"takahama.fukui.jp":true,"tsuruga.fukui.jp":true,"wakasa.fukui.jp":true,"ashiya.fukuoka.jp":true,"buzen.fukuoka.jp":true,"chikugo.fukuoka.jp":true,"chikuho.fukuoka.jp":true,"chikujo.fukuoka.jp":true,"chikushino.fukuoka.jp":true,"chikuzen.fukuoka.jp":true,"chuo.fukuoka.jp":true,"dazaifu.fukuoka.jp":true,"fukuchi.fukuoka.jp":true,"hakata.fukuoka.jp":true,"higashi.fukuoka.jp":true,"hirokawa.fukuoka.jp":true,"hisayama.fukuoka.jp":true,"iizuka.fukuoka.jp":true,"inatsuki.fukuoka.jp":true,"kaho.fukuoka.jp":true,"kasuga.fukuoka.jp":true,"kasuya.fukuoka.jp":true,"kawara.fukuoka.jp":true,"keisen.fukuoka.jp":true,"koga.fukuoka.jp":true,"kurate.fukuoka.jp":true,"kurogi.fukuoka.jp":true,"kurume.fukuoka.jp":true,"minami.fukuoka.jp":true,"miyako.fukuoka.jp":true,"miyama.fukuoka.jp":true,"miyawaka.fukuoka.jp":true,"mizumaki.fukuoka.jp":true,"munakata.fukuoka.jp":true,"nakagawa.fukuoka.jp":true,"nakama.fukuoka.jp":true,"nishi.fukuoka.jp":true,"nogata.fukuoka.jp":true,"ogori.fukuoka.jp":true,"okagaki.fukuoka.jp":true,"okawa.fukuoka.jp":true,"oki.fukuoka.jp":true,"omuta.fukuoka.jp":true,"onga.fukuoka.jp":true,"onojo.fukuoka.jp":true,"oto.fukuoka.jp":true,"saigawa.fukuoka.jp":true,"sasaguri.fukuoka.jp":true,"shingu.fukuoka.jp":true,"shinyoshitomi.fukuoka.jp":true,"shonai.fukuoka.jp":true,"soeda.fukuoka.jp":true,"sue.fukuoka.jp":true,"tachiarai.fukuoka.jp":true,"tagawa.fukuoka.jp":true,"takata.fukuoka.jp":true,"toho.fukuoka.jp":true,"toyotsu.fukuoka.jp":true,"tsuiki.fukuoka.jp":true,"ukiha.fukuoka.jp":true,"umi.fukuoka.jp":true,"usui.fukuoka.jp":true,"yamada.fukuoka.jp":true,"yame.fukuoka.jp":true,"yanagawa.fukuoka.jp":true,"yukuhashi.fukuoka.jp":true,"aizubange.fukushima.jp":true,"aizumisato.fukushima.jp":true,"aizuwakamatsu.fukushima.jp":true,"asakawa.fukushima.jp":true,"bandai.fukushima.jp":true,"date.fukushima.jp":true,"fukushima.fukushima.jp":true,"furudono.fukushima.jp":true,"futaba.fukushima.jp":true,"hanawa.fukushima.jp":true,"higashi.fukushima.jp":true,"hirata.fukushima.jp":true,"hirono.fukushima.jp":true,"iitate.fukushima.jp":true,"inawashiro.fukushima.jp":true,"ishikawa.fukushima.jp":true,"iwaki.fukushima.jp":true,"izumizaki.fukushima.jp":true,"kagamiishi.fukushima.jp":true,"kaneyama.fukushima.jp":true,"kawamata.fukushima.jp":true,"kitakata.fukushima.jp":true,"kitashiobara.fukushima.jp":true,"koori.fukushima.jp":true,"koriyama.fukushima.jp":true,"kunimi.fukushima.jp":true,"miharu.fukushima.jp":true,"mishima.fukushima.jp":true,"namie.fukushima.jp":true,"nango.fukushima.jp":true,"nishiaizu.fukushima.jp":true,"nishigo.fukushima.jp":true,"okuma.fukushima.jp":true,"omotego.fukushima.jp":true,"ono.fukushima.jp":true,"otama.fukushima.jp":true,"samegawa.fukushima.jp":true,"shimogo.fukushima.jp":true,"shirakawa.fukushima.jp":true,"showa.fukushima.jp":true,"soma.fukushima.jp":true,"sukagawa.fukushima.jp":true,"taishin.fukushima.jp":true,"tamakawa.fukushima.jp":true,"tanagura.fukushima.jp":true,"tenei.fukushima.jp":true,"yabuki.fukushima.jp":true,"yamato.fukushima.jp":true,"yamatsuri.fukushima.jp":true,"yanaizu.fukushima.jp":true,"yugawa.fukushima.jp":true,"anpachi.gifu.jp":true,"ena.gifu.jp":true,"gifu.gifu.jp":true,"ginan.gifu.jp":true,"godo.gifu.jp":true,"gujo.gifu.jp":true,"hashima.gifu.jp":true,"hichiso.gifu.jp":true,"hida.gifu.jp":true,"higashishirakawa.gifu.jp":true,"ibigawa.gifu.jp":true,"ikeda.gifu.jp":true,"kakamigahara.gifu.jp":true,"kani.gifu.jp":true,"kasahara.gifu.jp":true,"kasamatsu.gifu.jp":true,"kawaue.gifu.jp":true,"kitagata.gifu.jp":true,"mino.gifu.jp":true,"minokamo.gifu.jp":true,"mitake.gifu.jp":true,"mizunami.gifu.jp":true,"motosu.gifu.jp":true,"nakatsugawa.gifu.jp":true,"ogaki.gifu.jp":true,"sakahogi.gifu.jp":true,"seki.gifu.jp":true,"sekigahara.gifu.jp":true,"shirakawa.gifu.jp":true,"tajimi.gifu.jp":true,"takayama.gifu.jp":true,"tarui.gifu.jp":true,"toki.gifu.jp":true,"tomika.gifu.jp":true,"wanouchi.gifu.jp":true,"yamagata.gifu.jp":true,"yaotsu.gifu.jp":true,"yoro.gifu.jp":true,"annaka.gunma.jp":true,"chiyoda.gunma.jp":true,"fujioka.gunma.jp":true,"higashiagatsuma.gunma.jp":true,"isesaki.gunma.jp":true,"itakura.gunma.jp":true,"kanna.gunma.jp":true,"kanra.gunma.jp":true,"katashina.gunma.jp":true,"kawaba.gunma.jp":true,"kiryu.gunma.jp":true,"kusatsu.gunma.jp":true,"maebashi.gunma.jp":true,"meiwa.gunma.jp":true,"midori.gunma.jp":true,"minakami.gunma.jp":true,"naganohara.gunma.jp":true,"nakanojo.gunma.jp":true,"nanmoku.gunma.jp":true,"numata.gunma.jp":true,"oizumi.gunma.jp":true,"ora.gunma.jp":true,"ota.gunma.jp":true,"shibukawa.gunma.jp":true,"shimonita.gunma.jp":true,"shinto.gunma.jp":true,"showa.gunma.jp":true,"takasaki.gunma.jp":true,"takayama.gunma.jp":true,"tamamura.gunma.jp":true,"tatebayashi.gunma.jp":true,"tomioka.gunma.jp":true,"tsukiyono.gunma.jp":true,"tsumagoi.gunma.jp":true,"ueno.gunma.jp":true,"yoshioka.gunma.jp":true,"asaminami.hiroshima.jp":true,"daiwa.hiroshima.jp":true,"etajima.hiroshima.jp":true,"fuchu.hiroshima.jp":true,"fukuyama.hiroshima.jp":true,"hatsukaichi.hiroshima.jp":true,"higashihiroshima.hiroshima.jp":true,"hongo.hiroshima.jp":true,"jinsekikogen.hiroshima.jp":true,"kaita.hiroshima.jp":true,"kui.hiroshima.jp":true,"kumano.hiroshima.jp":true,"kure.hiroshima.jp":true,"mihara.hiroshima.jp":true,"miyoshi.hiroshima.jp":true,"naka.hiroshima.jp":true,"onomichi.hiroshima.jp":true,"osakikamijima.hiroshima.jp":true,"otake.hiroshima.jp":true,"saka.hiroshima.jp":true,"sera.hiroshima.jp":true,"seranishi.hiroshima.jp":true,"shinichi.hiroshima.jp":true,"shobara.hiroshima.jp":true,"takehara.hiroshima.jp":true,"abashiri.hokkaido.jp":true,"abira.hokkaido.jp":true,"aibetsu.hokkaido.jp":true,"akabira.hokkaido.jp":true,"akkeshi.hokkaido.jp":true,"asahikawa.hokkaido.jp":true,"ashibetsu.hokkaido.jp":true,"ashoro.hokkaido.jp":true,"assabu.hokkaido.jp":true,"atsuma.hokkaido.jp":true,"bibai.hokkaido.jp":true,"biei.hokkaido.jp":true,"bifuka.hokkaido.jp":true,"bihoro.hokkaido.jp":true,"biratori.hokkaido.jp":true,"chippubetsu.hokkaido.jp":true,"chitose.hokkaido.jp":true,"date.hokkaido.jp":true,"ebetsu.hokkaido.jp":true,"embetsu.hokkaido.jp":true,"eniwa.hokkaido.jp":true,"erimo.hokkaido.jp":true,"esan.hokkaido.jp":true,"esashi.hokkaido.jp":true,"fukagawa.hokkaido.jp":true,"fukushima.hokkaido.jp":true,"furano.hokkaido.jp":true,"furubira.hokkaido.jp":true,"haboro.hokkaido.jp":true,"hakodate.hokkaido.jp":true,"hamatonbetsu.hokkaido.jp":true,"hidaka.hokkaido.jp":true,"higashikagura.hokkaido.jp":true,"higashikawa.hokkaido.jp":true,"hiroo.hokkaido.jp":true,"hokuryu.hokkaido.jp":true,"hokuto.hokkaido.jp":true,"honbetsu.hokkaido.jp":true,"horokanai.hokkaido.jp":true,"horonobe.hokkaido.jp":true,"ikeda.hokkaido.jp":true,"imakane.hokkaido.jp":true,"ishikari.hokkaido.jp":true,"iwamizawa.hokkaido.jp":true,"iwanai.hokkaido.jp":true,"kamifurano.hokkaido.jp":true,"kamikawa.hokkaido.jp":true,"kamishihoro.hokkaido.jp":true,"kamisunagawa.hokkaido.jp":true,"kamoenai.hokkaido.jp":true,"kayabe.hokkaido.jp":true,"kembuchi.hokkaido.jp":true,"kikonai.hokkaido.jp":true,"kimobetsu.hokkaido.jp":true,"kitahiroshima.hokkaido.jp":true,"kitami.hokkaido.jp":true,"kiyosato.hokkaido.jp":true,"koshimizu.hokkaido.jp":true,"kunneppu.hokkaido.jp":true,"kuriyama.hokkaido.jp":true,"kuromatsunai.hokkaido.jp":true,"kushiro.hokkaido.jp":true,"kutchan.hokkaido.jp":true,"kyowa.hokkaido.jp":true,"mashike.hokkaido.jp":true,"matsumae.hokkaido.jp":true,"mikasa.hokkaido.jp":true,"minamifurano.hokkaido.jp":true,"mombetsu.hokkaido.jp":true,"moseushi.hokkaido.jp":true,"mukawa.hokkaido.jp":true,"muroran.hokkaido.jp":true,"naie.hokkaido.jp":true,"nakagawa.hokkaido.jp":true,"nakasatsunai.hokkaido.jp":true,"nakatombetsu.hokkaido.jp":true,"nanae.hokkaido.jp":true,"nanporo.hokkaido.jp":true,"nayoro.hokkaido.jp":true,"nemuro.hokkaido.jp":true,"niikappu.hokkaido.jp":true,"niki.hokkaido.jp":true,"nishiokoppe.hokkaido.jp":true,"noboribetsu.hokkaido.jp":true,"numata.hokkaido.jp":true,"obihiro.hokkaido.jp":true,"obira.hokkaido.jp":true,"oketo.hokkaido.jp":true,"okoppe.hokkaido.jp":true,"otaru.hokkaido.jp":true,"otobe.hokkaido.jp":true,"otofuke.hokkaido.jp":true,"otoineppu.hokkaido.jp":true,"oumu.hokkaido.jp":true,"ozora.hokkaido.jp":true,"pippu.hokkaido.jp":true,"rankoshi.hokkaido.jp":true,"rebun.hokkaido.jp":true,"rikubetsu.hokkaido.jp":true,"rishiri.hokkaido.jp":true,"rishirifuji.hokkaido.jp":true,"saroma.hokkaido.jp":true,"sarufutsu.hokkaido.jp":true,"shakotan.hokkaido.jp":true,"shari.hokkaido.jp":true,"shibecha.hokkaido.jp":true,"shibetsu.hokkaido.jp":true,"shikabe.hokkaido.jp":true,"shikaoi.hokkaido.jp":true,"shimamaki.hokkaido.jp":true,"shimizu.hokkaido.jp":true,"shimokawa.hokkaido.jp":true,"shinshinotsu.hokkaido.jp":true,"shintoku.hokkaido.jp":true,"shiranuka.hokkaido.jp":true,"shiraoi.hokkaido.jp":true,"shiriuchi.hokkaido.jp":true,"sobetsu.hokkaido.jp":true,"sunagawa.hokkaido.jp":true,"taiki.hokkaido.jp":true,"takasu.hokkaido.jp":true,"takikawa.hokkaido.jp":true,"takinoue.hokkaido.jp":true,"teshikaga.hokkaido.jp":true,"tobetsu.hokkaido.jp":true,"tohma.hokkaido.jp":true,"tomakomai.hokkaido.jp":true,"tomari.hokkaido.jp":true,"toya.hokkaido.jp":true,"toyako.hokkaido.jp":true,"toyotomi.hokkaido.jp":true,"toyoura.hokkaido.jp":true,"tsubetsu.hokkaido.jp":true,"tsukigata.hokkaido.jp":true,"urakawa.hokkaido.jp":true,"urausu.hokkaido.jp":true,"uryu.hokkaido.jp":true,"utashinai.hokkaido.jp":true,"wakkanai.hokkaido.jp":true,"wassamu.hokkaido.jp":true,"yakumo.hokkaido.jp":true,"yoichi.hokkaido.jp":true,"aioi.hyogo.jp":true,"akashi.hyogo.jp":true,"ako.hyogo.jp":true,"amagasaki.hyogo.jp":true,"aogaki.hyogo.jp":true,"asago.hyogo.jp":true,"ashiya.hyogo.jp":true,"awaji.hyogo.jp":true,"fukusaki.hyogo.jp":true,"goshiki.hyogo.jp":true,"harima.hyogo.jp":true,"himeji.hyogo.jp":true,"ichikawa.hyogo.jp":true,"inagawa.hyogo.jp":true,"itami.hyogo.jp":true,"kakogawa.hyogo.jp":true,"kamigori.hyogo.jp":true,"kamikawa.hyogo.jp":true,"kasai.hyogo.jp":true,"kasuga.hyogo.jp":true,"kawanishi.hyogo.jp":true,"miki.hyogo.jp":true,"minamiawaji.hyogo.jp":true,"nishinomiya.hyogo.jp":true,"nishiwaki.hyogo.jp":true,"ono.hyogo.jp":true,"sanda.hyogo.jp":true,"sannan.hyogo.jp":true,"sasayama.hyogo.jp":true,"sayo.hyogo.jp":true,"shingu.hyogo.jp":true,"shinonsen.hyogo.jp":true,"shiso.hyogo.jp":true,"sumoto.hyogo.jp":true,"taishi.hyogo.jp":true,"taka.hyogo.jp":true,"takarazuka.hyogo.jp":true,"takasago.hyogo.jp":true,"takino.hyogo.jp":true,"tamba.hyogo.jp":true,"tatsuno.hyogo.jp":true,"toyooka.hyogo.jp":true,"yabu.hyogo.jp":true,"yashiro.hyogo.jp":true,"yoka.hyogo.jp":true,"yokawa.hyogo.jp":true,"ami.ibaraki.jp":true,"asahi.ibaraki.jp":true,"bando.ibaraki.jp":true,"chikusei.ibaraki.jp":true,"daigo.ibaraki.jp":true,"fujishiro.ibaraki.jp":true,"hitachi.ibaraki.jp":true,"hitachinaka.ibaraki.jp":true,"hitachiomiya.ibaraki.jp":true,"hitachiota.ibaraki.jp":true,"ibaraki.ibaraki.jp":true,"ina.ibaraki.jp":true,"inashiki.ibaraki.jp":true,"itako.ibaraki.jp":true,"iwama.ibaraki.jp":true,"joso.ibaraki.jp":true,"kamisu.ibaraki.jp":true,"kasama.ibaraki.jp":true,"kashima.ibaraki.jp":true,"kasumigaura.ibaraki.jp":true,"koga.ibaraki.jp":true,"miho.ibaraki.jp":true,"mito.ibaraki.jp":true,"moriya.ibaraki.jp":true,"naka.ibaraki.jp":true,"namegata.ibaraki.jp":true,"oarai.ibaraki.jp":true,"ogawa.ibaraki.jp":true,"omitama.ibaraki.jp":true,"ryugasaki.ibaraki.jp":true,"sakai.ibaraki.jp":true,"sakuragawa.ibaraki.jp":true,"shimodate.ibaraki.jp":true,"shimotsuma.ibaraki.jp":true,"shirosato.ibaraki.jp":true,"sowa.ibaraki.jp":true,"suifu.ibaraki.jp":true,"takahagi.ibaraki.jp":true,"tamatsukuri.ibaraki.jp":true,"tokai.ibaraki.jp":true,"tomobe.ibaraki.jp":true,"tone.ibaraki.jp":true,"toride.ibaraki.jp":true,"tsuchiura.ibaraki.jp":true,"tsukuba.ibaraki.jp":true,"uchihara.ibaraki.jp":true,"ushiku.ibaraki.jp":true,"yachiyo.ibaraki.jp":true,"yamagata.ibaraki.jp":true,"yawara.ibaraki.jp":true,"yuki.ibaraki.jp":true,"anamizu.ishikawa.jp":true,"hakui.ishikawa.jp":true,"hakusan.ishikawa.jp":true,"kaga.ishikawa.jp":true,"kahoku.ishikawa.jp":true,"kanazawa.ishikawa.jp":true,"kawakita.ishikawa.jp":true,"komatsu.ishikawa.jp":true,"nakanoto.ishikawa.jp":true,"nanao.ishikawa.jp":true,"nomi.ishikawa.jp":true,"nonoichi.ishikawa.jp":true,"noto.ishikawa.jp":true,"shika.ishikawa.jp":true,"suzu.ishikawa.jp":true,"tsubata.ishikawa.jp":true,"tsurugi.ishikawa.jp":true,"uchinada.ishikawa.jp":true,"wajima.ishikawa.jp":true,"fudai.iwate.jp":true,"fujisawa.iwate.jp":true,"hanamaki.iwate.jp":true,"hiraizumi.iwate.jp":true,"hirono.iwate.jp":true,"ichinohe.iwate.jp":true,"ichinoseki.iwate.jp":true,"iwaizumi.iwate.jp":true,"iwate.iwate.jp":true,"joboji.iwate.jp":true,"kamaishi.iwate.jp":true,"kanegasaki.iwate.jp":true,"karumai.iwate.jp":true,"kawai.iwate.jp":true,"kitakami.iwate.jp":true,"kuji.iwate.jp":true,"kunohe.iwate.jp":true,"kuzumaki.iwate.jp":true,"miyako.iwate.jp":true,"mizusawa.iwate.jp":true,"morioka.iwate.jp":true,"ninohe.iwate.jp":true,"noda.iwate.jp":true,"ofunato.iwate.jp":true,"oshu.iwate.jp":true,"otsuchi.iwate.jp":true,"rikuzentakata.iwate.jp":true,"shiwa.iwate.jp":true,"shizukuishi.iwate.jp":true,"sumita.iwate.jp":true,"tanohata.iwate.jp":true,"tono.iwate.jp":true,"yahaba.iwate.jp":true,"yamada.iwate.jp":true,"ayagawa.kagawa.jp":true,"higashikagawa.kagawa.jp":true,"kanonji.kagawa.jp":true,"kotohira.kagawa.jp":true,"manno.kagawa.jp":true,"marugame.kagawa.jp":true,"mitoyo.kagawa.jp":true,"naoshima.kagawa.jp":true,"sanuki.kagawa.jp":true,"tadotsu.kagawa.jp":true,"takamatsu.kagawa.jp":true,"tonosho.kagawa.jp":true,"uchinomi.kagawa.jp":true,"utazu.kagawa.jp":true,"zentsuji.kagawa.jp":true,"akune.kagoshima.jp":true,"amami.kagoshima.jp":true,"hioki.kagoshima.jp":true,"isa.kagoshima.jp":true,"isen.kagoshima.jp":true,"izumi.kagoshima.jp":true,"kagoshima.kagoshima.jp":true,"kanoya.kagoshima.jp":true,"kawanabe.kagoshima.jp":true,"kinko.kagoshima.jp":true,"kouyama.kagoshima.jp":true,"makurazaki.kagoshima.jp":true,"matsumoto.kagoshima.jp":true,"minamitane.kagoshima.jp":true,"nakatane.kagoshima.jp":true,"nishinoomote.kagoshima.jp":true,"satsumasendai.kagoshima.jp":true,"soo.kagoshima.jp":true,"tarumizu.kagoshima.jp":true,"yusui.kagoshima.jp":true,"aikawa.kanagawa.jp":true,"atsugi.kanagawa.jp":true,"ayase.kanagawa.jp":true,"chigasaki.kanagawa.jp":true,"ebina.kanagawa.jp":true,"fujisawa.kanagawa.jp":true,"hadano.kanagawa.jp":true,"hakone.kanagawa.jp":true,"hiratsuka.kanagawa.jp":true,"isehara.kanagawa.jp":true,"kaisei.kanagawa.jp":true,"kamakura.kanagawa.jp":true,"kiyokawa.kanagawa.jp":true,"matsuda.kanagawa.jp":true,"minamiashigara.kanagawa.jp":true,"miura.kanagawa.jp":true,"nakai.kanagawa.jp":true,"ninomiya.kanagawa.jp":true,"odawara.kanagawa.jp":true,"oi.kanagawa.jp":true,"oiso.kanagawa.jp":true,"sagamihara.kanagawa.jp":true,"samukawa.kanagawa.jp":true,"tsukui.kanagawa.jp":true,"yamakita.kanagawa.jp":true,"yamato.kanagawa.jp":true,"yokosuka.kanagawa.jp":true,"yugawara.kanagawa.jp":true,"zama.kanagawa.jp":true,"zushi.kanagawa.jp":true,"aki.kochi.jp":true,"geisei.kochi.jp":true,"hidaka.kochi.jp":true,"higashitsuno.kochi.jp":true,"ino.kochi.jp":true,"kagami.kochi.jp":true,"kami.kochi.jp":true,"kitagawa.kochi.jp":true,"kochi.kochi.jp":true,"mihara.kochi.jp":true,"motoyama.kochi.jp":true,"muroto.kochi.jp":true,"nahari.kochi.jp":true,"nakamura.kochi.jp":true,"nankoku.kochi.jp":true,"nishitosa.kochi.jp":true,"niyodogawa.kochi.jp":true,"ochi.kochi.jp":true,"okawa.kochi.jp":true,"otoyo.kochi.jp":true,"otsuki.kochi.jp":true,"sakawa.kochi.jp":true,"sukumo.kochi.jp":true,"susaki.kochi.jp":true,"tosa.kochi.jp":true,"tosashimizu.kochi.jp":true,"toyo.kochi.jp":true,"tsuno.kochi.jp":true,"umaji.kochi.jp":true,"yasuda.kochi.jp":true,"yusuhara.kochi.jp":true,"amakusa.kumamoto.jp":true,"arao.kumamoto.jp":true,"aso.kumamoto.jp":true,"choyo.kumamoto.jp":true,"gyokuto.kumamoto.jp":true,"hitoyoshi.kumamoto.jp":true,"kamiamakusa.kumamoto.jp":true,"kashima.kumamoto.jp":true,"kikuchi.kumamoto.jp":true,"kosa.kumamoto.jp":true,"kumamoto.kumamoto.jp":true,"mashiki.kumamoto.jp":true,"mifune.kumamoto.jp":true,"minamata.kumamoto.jp":true,"minamioguni.kumamoto.jp":true,"nagasu.kumamoto.jp":true,"nishihara.kumamoto.jp":true,"oguni.kumamoto.jp":true,"ozu.kumamoto.jp":true,"sumoto.kumamoto.jp":true,"takamori.kumamoto.jp":true,"uki.kumamoto.jp":true,"uto.kumamoto.jp":true,"yamaga.kumamoto.jp":true,"yamato.kumamoto.jp":true,"yatsushiro.kumamoto.jp":true,"ayabe.kyoto.jp":true,"fukuchiyama.kyoto.jp":true,"higashiyama.kyoto.jp":true,"ide.kyoto.jp":true,"ine.kyoto.jp":true,"joyo.kyoto.jp":true,"kameoka.kyoto.jp":true,"kamo.kyoto.jp":true,"kita.kyoto.jp":true,"kizu.kyoto.jp":true,"kumiyama.kyoto.jp":true,"kyotamba.kyoto.jp":true,"kyotanabe.kyoto.jp":true,"kyotango.kyoto.jp":true,"maizuru.kyoto.jp":true,"minami.kyoto.jp":true,"minamiyamashiro.kyoto.jp":true,"miyazu.kyoto.jp":true,"muko.kyoto.jp":true,"nagaokakyo.kyoto.jp":true,"nakagyo.kyoto.jp":true,"nantan.kyoto.jp":true,"oyamazaki.kyoto.jp":true,"sakyo.kyoto.jp":true,"seika.kyoto.jp":true,"tanabe.kyoto.jp":true,"uji.kyoto.jp":true,"ujitawara.kyoto.jp":true,"wazuka.kyoto.jp":true,"yamashina.kyoto.jp":true,"yawata.kyoto.jp":true,"asahi.mie.jp":true,"inabe.mie.jp":true,"ise.mie.jp":true,"kameyama.mie.jp":true,"kawagoe.mie.jp":true,"kiho.mie.jp":true,"kisosaki.mie.jp":true,"kiwa.mie.jp":true,"komono.mie.jp":true,"kumano.mie.jp":true,"kuwana.mie.jp":true,"matsusaka.mie.jp":true,"meiwa.mie.jp":true,"mihama.mie.jp":true,"minamiise.mie.jp":true,"misugi.mie.jp":true,"miyama.mie.jp":true,"nabari.mie.jp":true,"shima.mie.jp":true,"suzuka.mie.jp":true,"tado.mie.jp":true,"taiki.mie.jp":true,"taki.mie.jp":true,"tamaki.mie.jp":true,"toba.mie.jp":true,"tsu.mie.jp":true,"udono.mie.jp":true,"ureshino.mie.jp":true,"watarai.mie.jp":true,"yokkaichi.mie.jp":true,"furukawa.miyagi.jp":true,"higashimatsushima.miyagi.jp":true,"ishinomaki.miyagi.jp":true,"iwanuma.miyagi.jp":true,"kakuda.miyagi.jp":true,"kami.miyagi.jp":true,"kawasaki.miyagi.jp":true,"kesennuma.miyagi.jp":true,"marumori.miyagi.jp":true,"matsushima.miyagi.jp":true,"minamisanriku.miyagi.jp":true,"misato.miyagi.jp":true,"murata.miyagi.jp":true,"natori.miyagi.jp":true,"ogawara.miyagi.jp":true,"ohira.miyagi.jp":true,"onagawa.miyagi.jp":true,"osaki.miyagi.jp":true,"rifu.miyagi.jp":true,"semine.miyagi.jp":true,"shibata.miyagi.jp":true,"shichikashuku.miyagi.jp":true,"shikama.miyagi.jp":true,"shiogama.miyagi.jp":true,"shiroishi.miyagi.jp":true,"tagajo.miyagi.jp":true,"taiwa.miyagi.jp":true,"tome.miyagi.jp":true,"tomiya.miyagi.jp":true,"wakuya.miyagi.jp":true,"watari.miyagi.jp":true,"yamamoto.miyagi.jp":true,"zao.miyagi.jp":true,"aya.miyazaki.jp":true,"ebino.miyazaki.jp":true,"gokase.miyazaki.jp":true,"hyuga.miyazaki.jp":true,"kadogawa.miyazaki.jp":true,"kawaminami.miyazaki.jp":true,"kijo.miyazaki.jp":true,"kitagawa.miyazaki.jp":true,"kitakata.miyazaki.jp":true,"kitaura.miyazaki.jp":true,"kobayashi.miyazaki.jp":true,"kunitomi.miyazaki.jp":true,"kushima.miyazaki.jp":true,"mimata.miyazaki.jp":true,"miyakonojo.miyazaki.jp":true,"miyazaki.miyazaki.jp":true,"morotsuka.miyazaki.jp":true,"nichinan.miyazaki.jp":true,"nishimera.miyazaki.jp":true,"nobeoka.miyazaki.jp":true,"saito.miyazaki.jp":true,"shiiba.miyazaki.jp":true,"shintomi.miyazaki.jp":true,"takaharu.miyazaki.jp":true,"takanabe.miyazaki.jp":true,"takazaki.miyazaki.jp":true,"tsuno.miyazaki.jp":true,"achi.nagano.jp":true,"agematsu.nagano.jp":true,"anan.nagano.jp":true,"aoki.nagano.jp":true,"asahi.nagano.jp":true,"azumino.nagano.jp":true,"chikuhoku.nagano.jp":true,"chikuma.nagano.jp":true,"chino.nagano.jp":true,"fujimi.nagano.jp":true,"hakuba.nagano.jp":true,"hara.nagano.jp":true,"hiraya.nagano.jp":true,"iida.nagano.jp":true,"iijima.nagano.jp":true,"iiyama.nagano.jp":true,"iizuna.nagano.jp":true,"ikeda.nagano.jp":true,"ikusaka.nagano.jp":true,"ina.nagano.jp":true,"karuizawa.nagano.jp":true,"kawakami.nagano.jp":true,"kiso.nagano.jp":true,"kisofukushima.nagano.jp":true,"kitaaiki.nagano.jp":true,"komagane.nagano.jp":true,"komoro.nagano.jp":true,"matsukawa.nagano.jp":true,"matsumoto.nagano.jp":true,"miasa.nagano.jp":true,"minamiaiki.nagano.jp":true,"minamimaki.nagano.jp":true,"minamiminowa.nagano.jp":true,"minowa.nagano.jp":true,"miyada.nagano.jp":true,"miyota.nagano.jp":true,"mochizuki.nagano.jp":true,"nagano.nagano.jp":true,"nagawa.nagano.jp":true,"nagiso.nagano.jp":true,"nakagawa.nagano.jp":true,"nakano.nagano.jp":true,"nozawaonsen.nagano.jp":true,"obuse.nagano.jp":true,"ogawa.nagano.jp":true,"okaya.nagano.jp":true,"omachi.nagano.jp":true,"omi.nagano.jp":true,"ookuwa.nagano.jp":true,"ooshika.nagano.jp":true,"otaki.nagano.jp":true,"otari.nagano.jp":true,"sakae.nagano.jp":true,"sakaki.nagano.jp":true,"saku.nagano.jp":true,"sakuho.nagano.jp":true,"shimosuwa.nagano.jp":true,"shinanomachi.nagano.jp":true,"shiojiri.nagano.jp":true,"suwa.nagano.jp":true,"suzaka.nagano.jp":true,"takagi.nagano.jp":true,"takamori.nagano.jp":true,"takayama.nagano.jp":true,"tateshina.nagano.jp":true,"tatsuno.nagano.jp":true,"togakushi.nagano.jp":true,"togura.nagano.jp":true,"tomi.nagano.jp":true,"ueda.nagano.jp":true,"wada.nagano.jp":true,"yamagata.nagano.jp":true,"yamanouchi.nagano.jp":true,"yasaka.nagano.jp":true,"yasuoka.nagano.jp":true,"chijiwa.nagasaki.jp":true,"futsu.nagasaki.jp":true,"goto.nagasaki.jp":true,"hasami.nagasaki.jp":true,"hirado.nagasaki.jp":true,"iki.nagasaki.jp":true,"isahaya.nagasaki.jp":true,"kawatana.nagasaki.jp":true,"kuchinotsu.nagasaki.jp":true,"matsuura.nagasaki.jp":true,"nagasaki.nagasaki.jp":true,"obama.nagasaki.jp":true,"omura.nagasaki.jp":true,"oseto.nagasaki.jp":true,"saikai.nagasaki.jp":true,"sasebo.nagasaki.jp":true,"seihi.nagasaki.jp":true,"shimabara.nagasaki.jp":true,"shinkamigoto.nagasaki.jp":true,"togitsu.nagasaki.jp":true,"tsushima.nagasaki.jp":true,"unzen.nagasaki.jp":true,"ando.nara.jp":true,"gose.nara.jp":true,"heguri.nara.jp":true,"higashiyoshino.nara.jp":true,"ikaruga.nara.jp":true,"ikoma.nara.jp":true,"kamikitayama.nara.jp":true,"kanmaki.nara.jp":true,"kashiba.nara.jp":true,"kashihara.nara.jp":true,"katsuragi.nara.jp":true,"kawai.nara.jp":true,"kawakami.nara.jp":true,"kawanishi.nara.jp":true,"koryo.nara.jp":true,"kurotaki.nara.jp":true,"mitsue.nara.jp":true,"miyake.nara.jp":true,"nara.nara.jp":true,"nosegawa.nara.jp":true,"oji.nara.jp":true,"ouda.nara.jp":true,"oyodo.nara.jp":true,"sakurai.nara.jp":true,"sango.nara.jp":true,"shimoichi.nara.jp":true,"shimokitayama.nara.jp":true,"shinjo.nara.jp":true,"soni.nara.jp":true,"takatori.nara.jp":true,"tawaramoto.nara.jp":true,"tenkawa.nara.jp":true,"tenri.nara.jp":true,"uda.nara.jp":true,"yamatokoriyama.nara.jp":true,"yamatotakada.nara.jp":true,"yamazoe.nara.jp":true,"yoshino.nara.jp":true,"aga.niigata.jp":true,"agano.niigata.jp":true,"gosen.niigata.jp":true,"itoigawa.niigata.jp":true,"izumozaki.niigata.jp":true,"joetsu.niigata.jp":true,"kamo.niigata.jp":true,"kariwa.niigata.jp":true,"kashiwazaki.niigata.jp":true,"minamiuonuma.niigata.jp":true,"mitsuke.niigata.jp":true,"muika.niigata.jp":true,"murakami.niigata.jp":true,"myoko.niigata.jp":true,"nagaoka.niigata.jp":true,"niigata.niigata.jp":true,"ojiya.niigata.jp":true,"omi.niigata.jp":true,"sado.niigata.jp":true,"sanjo.niigata.jp":true,"seiro.niigata.jp":true,"seirou.niigata.jp":true,"sekikawa.niigata.jp":true,"shibata.niigata.jp":true,"tagami.niigata.jp":true,"tainai.niigata.jp":true,"tochio.niigata.jp":true,"tokamachi.niigata.jp":true,"tsubame.niigata.jp":true,"tsunan.niigata.jp":true,"uonuma.niigata.jp":true,"yahiko.niigata.jp":true,"yoita.niigata.jp":true,"yuzawa.niigata.jp":true,"beppu.oita.jp":true,"bungoono.oita.jp":true,"bungotakada.oita.jp":true,"hasama.oita.jp":true,"hiji.oita.jp":true,"himeshima.oita.jp":true,"hita.oita.jp":true,"kamitsue.oita.jp":true,"kokonoe.oita.jp":true,"kuju.oita.jp":true,"kunisaki.oita.jp":true,"kusu.oita.jp":true,"oita.oita.jp":true,"saiki.oita.jp":true,"taketa.oita.jp":true,"tsukumi.oita.jp":true,"usa.oita.jp":true,"usuki.oita.jp":true,"yufu.oita.jp":true,"akaiwa.okayama.jp":true,"asakuchi.okayama.jp":true,"bizen.okayama.jp":true,"hayashima.okayama.jp":true,"ibara.okayama.jp":true,"kagamino.okayama.jp":true,"kasaoka.okayama.jp":true,"kibichuo.okayama.jp":true,"kumenan.okayama.jp":true,"kurashiki.okayama.jp":true,"maniwa.okayama.jp":true,"misaki.okayama.jp":true,"nagi.okayama.jp":true,"niimi.okayama.jp":true,"nishiawakura.okayama.jp":true,"okayama.okayama.jp":true,"satosho.okayama.jp":true,"setouchi.okayama.jp":true,"shinjo.okayama.jp":true,"shoo.okayama.jp":true,"soja.okayama.jp":true,"takahashi.okayama.jp":true,"tamano.okayama.jp":true,"tsuyama.okayama.jp":true,"wake.okayama.jp":true,"yakage.okayama.jp":true,"aguni.okinawa.jp":true,"ginowan.okinawa.jp":true,"ginoza.okinawa.jp":true,"gushikami.okinawa.jp":true,"haebaru.okinawa.jp":true,"higashi.okinawa.jp":true,"hirara.okinawa.jp":true,"iheya.okinawa.jp":true,"ishigaki.okinawa.jp":true,"ishikawa.okinawa.jp":true,"itoman.okinawa.jp":true,"izena.okinawa.jp":true,"kadena.okinawa.jp":true,"kin.okinawa.jp":true,"kitadaito.okinawa.jp":true,"kitanakagusuku.okinawa.jp":true,"kumejima.okinawa.jp":true,"kunigami.okinawa.jp":true,"minamidaito.okinawa.jp":true,"motobu.okinawa.jp":true,"nago.okinawa.jp":true,"naha.okinawa.jp":true,"nakagusuku.okinawa.jp":true,"nakijin.okinawa.jp":true,"nanjo.okinawa.jp":true,"nishihara.okinawa.jp":true,"ogimi.okinawa.jp":true,"okinawa.okinawa.jp":true,"onna.okinawa.jp":true,"shimoji.okinawa.jp":true,"taketomi.okinawa.jp":true,"tarama.okinawa.jp":true,"tokashiki.okinawa.jp":true,"tomigusuku.okinawa.jp":true,"tonaki.okinawa.jp":true,"urasoe.okinawa.jp":true,"uruma.okinawa.jp":true,"yaese.okinawa.jp":true,"yomitan.okinawa.jp":true,"yonabaru.okinawa.jp":true,"yonaguni.okinawa.jp":true,"zamami.okinawa.jp":true,"abeno.osaka.jp":true,"chihayaakasaka.osaka.jp":true,"chuo.osaka.jp":true,"daito.osaka.jp":true,"fujiidera.osaka.jp":true,"habikino.osaka.jp":true,"hannan.osaka.jp":true,"higashiosaka.osaka.jp":true,"higashisumiyoshi.osaka.jp":true,"higashiyodogawa.osaka.jp":true,"hirakata.osaka.jp":true,"ibaraki.osaka.jp":true,"ikeda.osaka.jp":true,"izumi.osaka.jp":true,"izumiotsu.osaka.jp":true,"izumisano.osaka.jp":true,"kadoma.osaka.jp":true,"kaizuka.osaka.jp":true,"kanan.osaka.jp":true,"kashiwara.osaka.jp":true,"katano.osaka.jp":true,"kawachinagano.osaka.jp":true,"kishiwada.osaka.jp":true,"kita.osaka.jp":true,"kumatori.osaka.jp":true,"matsubara.osaka.jp":true,"minato.osaka.jp":true,"minoh.osaka.jp":true,"misaki.osaka.jp":true,"moriguchi.osaka.jp":true,"neyagawa.osaka.jp":true,"nishi.osaka.jp":true,"nose.osaka.jp":true,"osakasayama.osaka.jp":true,"sakai.osaka.jp":true,"sayama.osaka.jp":true,"sennan.osaka.jp":true,"settsu.osaka.jp":true,"shijonawate.osaka.jp":true,"shimamoto.osaka.jp":true,"suita.osaka.jp":true,"tadaoka.osaka.jp":true,"taishi.osaka.jp":true,"tajiri.osaka.jp":true,"takaishi.osaka.jp":true,"takatsuki.osaka.jp":true,"tondabayashi.osaka.jp":true,"toyonaka.osaka.jp":true,"toyono.osaka.jp":true,"yao.osaka.jp":true,"ariake.saga.jp":true,"arita.saga.jp":true,"fukudomi.saga.jp":true,"genkai.saga.jp":true,"hamatama.saga.jp":true,"hizen.saga.jp":true,"imari.saga.jp":true,"kamimine.saga.jp":true,"kanzaki.saga.jp":true,"karatsu.saga.jp":true,"kashima.saga.jp":true,"kitagata.saga.jp":true,"kitahata.saga.jp":true,"kiyama.saga.jp":true,"kouhoku.saga.jp":true,"kyuragi.saga.jp":true,"nishiarita.saga.jp":true,"ogi.saga.jp":true,"omachi.saga.jp":true,"ouchi.saga.jp":true,"saga.saga.jp":true,"shiroishi.saga.jp":true,"taku.saga.jp":true,"tara.saga.jp":true,"tosu.saga.jp":true,"yoshinogari.saga.jp":true,"arakawa.saitama.jp":true,"asaka.saitama.jp":true,"chichibu.saitama.jp":true,"fujimi.saitama.jp":true,"fujimino.saitama.jp":true,"fukaya.saitama.jp":true,"hanno.saitama.jp":true,"hanyu.saitama.jp":true,"hasuda.saitama.jp":true,"hatogaya.saitama.jp":true,"hatoyama.saitama.jp":true,"hidaka.saitama.jp":true,"higashichichibu.saitama.jp":true,"higashimatsuyama.saitama.jp":true,"honjo.saitama.jp":true,"ina.saitama.jp":true,"iruma.saitama.jp":true,"iwatsuki.saitama.jp":true,"kamiizumi.saitama.jp":true,"kamikawa.saitama.jp":true,"kamisato.saitama.jp":true,"kasukabe.saitama.jp":true,"kawagoe.saitama.jp":true,"kawaguchi.saitama.jp":true,"kawajima.saitama.jp":true,"kazo.saitama.jp":true,"kitamoto.saitama.jp":true,"koshigaya.saitama.jp":true,"kounosu.saitama.jp":true,"kuki.saitama.jp":true,"kumagaya.saitama.jp":true,"matsubushi.saitama.jp":true,"minano.saitama.jp":true,"misato.saitama.jp":true,"miyashiro.saitama.jp":true,"miyoshi.saitama.jp":true,"moroyama.saitama.jp":true,"nagatoro.saitama.jp":true,"namegawa.saitama.jp":true,"niiza.saitama.jp":true,"ogano.saitama.jp":true,"ogawa.saitama.jp":true,"ogose.saitama.jp":true,"okegawa.saitama.jp":true,"omiya.saitama.jp":true,"otaki.saitama.jp":true,"ranzan.saitama.jp":true,"ryokami.saitama.jp":true,"saitama.saitama.jp":true,"sakado.saitama.jp":true,"satte.saitama.jp":true,"sayama.saitama.jp":true,"shiki.saitama.jp":true,"shiraoka.saitama.jp":true,"soka.saitama.jp":true,"sugito.saitama.jp":true,"toda.saitama.jp":true,"tokigawa.saitama.jp":true,"tokorozawa.saitama.jp":true,"tsurugashima.saitama.jp":true,"urawa.saitama.jp":true,"warabi.saitama.jp":true,"yashio.saitama.jp":true,"yokoze.saitama.jp":true,"yono.saitama.jp":true,"yorii.saitama.jp":true,"yoshida.saitama.jp":true,"yoshikawa.saitama.jp":true,"yoshimi.saitama.jp":true,"aisho.shiga.jp":true,"gamo.shiga.jp":true,"higashiomi.shiga.jp":true,"hikone.shiga.jp":true,"koka.shiga.jp":true,"konan.shiga.jp":true,"kosei.shiga.jp":true,"koto.shiga.jp":true,"kusatsu.shiga.jp":true,"maibara.shiga.jp":true,"moriyama.shiga.jp":true,"nagahama.shiga.jp":true,"nishiazai.shiga.jp":true,"notogawa.shiga.jp":true,"omihachiman.shiga.jp":true,"otsu.shiga.jp":true,"ritto.shiga.jp":true,"ryuoh.shiga.jp":true,"takashima.shiga.jp":true,"takatsuki.shiga.jp":true,"torahime.shiga.jp":true,"toyosato.shiga.jp":true,"yasu.shiga.jp":true,"akagi.shimane.jp":true,"ama.shimane.jp":true,"gotsu.shimane.jp":true,"hamada.shimane.jp":true,"higashiizumo.shimane.jp":true,"hikawa.shimane.jp":true,"hikimi.shimane.jp":true,"izumo.shimane.jp":true,"kakinoki.shimane.jp":true,"masuda.shimane.jp":true,"matsue.shimane.jp":true,"misato.shimane.jp":true,"nishinoshima.shimane.jp":true,"ohda.shimane.jp":true,"okinoshima.shimane.jp":true,"okuizumo.shimane.jp":true,"shimane.shimane.jp":true,"tamayu.shimane.jp":true,"tsuwano.shimane.jp":true,"unnan.shimane.jp":true,"yakumo.shimane.jp":true,"yasugi.shimane.jp":true,"yatsuka.shimane.jp":true,"arai.shizuoka.jp":true,"atami.shizuoka.jp":true,"fuji.shizuoka.jp":true,"fujieda.shizuoka.jp":true,"fujikawa.shizuoka.jp":true,"fujinomiya.shizuoka.jp":true,"fukuroi.shizuoka.jp":true,"gotemba.shizuoka.jp":true,"haibara.shizuoka.jp":true,"hamamatsu.shizuoka.jp":true,"higashiizu.shizuoka.jp":true,"ito.shizuoka.jp":true,"iwata.shizuoka.jp":true,"izu.shizuoka.jp":true,"izunokuni.shizuoka.jp":true,"kakegawa.shizuoka.jp":true,"kannami.shizuoka.jp":true,"kawanehon.shizuoka.jp":true,"kawazu.shizuoka.jp":true,"kikugawa.shizuoka.jp":true,"kosai.shizuoka.jp":true,"makinohara.shizuoka.jp":true,"matsuzaki.shizuoka.jp":true,"minamiizu.shizuoka.jp":true,"mishima.shizuoka.jp":true,"morimachi.shizuoka.jp":true,"nishiizu.shizuoka.jp":true,"numazu.shizuoka.jp":true,"omaezaki.shizuoka.jp":true,"shimada.shizuoka.jp":true,"shimizu.shizuoka.jp":true,"shimoda.shizuoka.jp":true,"shizuoka.shizuoka.jp":true,"susono.shizuoka.jp":true,"yaizu.shizuoka.jp":true,"yoshida.shizuoka.jp":true,"ashikaga.tochigi.jp":true,"bato.tochigi.jp":true,"haga.tochigi.jp":true,"ichikai.tochigi.jp":true,"iwafune.tochigi.jp":true,"kaminokawa.tochigi.jp":true,"kanuma.tochigi.jp":true,"karasuyama.tochigi.jp":true,"kuroiso.tochigi.jp":true,"mashiko.tochigi.jp":true,"mibu.tochigi.jp":true,"moka.tochigi.jp":true,"motegi.tochigi.jp":true,"nasu.tochigi.jp":true,"nasushiobara.tochigi.jp":true,"nikko.tochigi.jp":true,"nishikata.tochigi.jp":true,"nogi.tochigi.jp":true,"ohira.tochigi.jp":true,"ohtawara.tochigi.jp":true,"oyama.tochigi.jp":true,"sakura.tochigi.jp":true,"sano.tochigi.jp":true,"shimotsuke.tochigi.jp":true,"shioya.tochigi.jp":true,"takanezawa.tochigi.jp":true,"tochigi.tochigi.jp":true,"tsuga.tochigi.jp":true,"ujiie.tochigi.jp":true,"utsunomiya.tochigi.jp":true,"yaita.tochigi.jp":true,"aizumi.tokushima.jp":true,"anan.tokushima.jp":true,"ichiba.tokushima.jp":true,"itano.tokushima.jp":true,"kainan.tokushima.jp":true,"komatsushima.tokushima.jp":true,"matsushige.tokushima.jp":true,"mima.tokushima.jp":true,"minami.tokushima.jp":true,"miyoshi.tokushima.jp":true,"mugi.tokushima.jp":true,"nakagawa.tokushima.jp":true,"naruto.tokushima.jp":true,"sanagochi.tokushima.jp":true,"shishikui.tokushima.jp":true,"tokushima.tokushima.jp":true,"wajiki.tokushima.jp":true,"adachi.tokyo.jp":true,"akiruno.tokyo.jp":true,"akishima.tokyo.jp":true,"aogashima.tokyo.jp":true,"arakawa.tokyo.jp":true,"bunkyo.tokyo.jp":true,"chiyoda.tokyo.jp":true,"chofu.tokyo.jp":true,"chuo.tokyo.jp":true,"edogawa.tokyo.jp":true,"fuchu.tokyo.jp":true,"fussa.tokyo.jp":true,"hachijo.tokyo.jp":true,"hachioji.tokyo.jp":true,"hamura.tokyo.jp":true,"higashikurume.tokyo.jp":true,"higashimurayama.tokyo.jp":true,"higashiyamato.tokyo.jp":true,"hino.tokyo.jp":true,"hinode.tokyo.jp":true,"hinohara.tokyo.jp":true,"inagi.tokyo.jp":true,"itabashi.tokyo.jp":true,"katsushika.tokyo.jp":true,"kita.tokyo.jp":true,"kiyose.tokyo.jp":true,"kodaira.tokyo.jp":true,"koganei.tokyo.jp":true,"kokubunji.tokyo.jp":true,"komae.tokyo.jp":true,"koto.tokyo.jp":true,"kouzushima.tokyo.jp":true,"kunitachi.tokyo.jp":true,"machida.tokyo.jp":true,"meguro.tokyo.jp":true,"minato.tokyo.jp":true,"mitaka.tokyo.jp":true,"mizuho.tokyo.jp":true,"musashimurayama.tokyo.jp":true,"musashino.tokyo.jp":true,"nakano.tokyo.jp":true,"nerima.tokyo.jp":true,"ogasawara.tokyo.jp":true,"okutama.tokyo.jp":true,"ome.tokyo.jp":true,"oshima.tokyo.jp":true,"ota.tokyo.jp":true,"setagaya.tokyo.jp":true,"shibuya.tokyo.jp":true,"shinagawa.tokyo.jp":true,"shinjuku.tokyo.jp":true,"suginami.tokyo.jp":true,"sumida.tokyo.jp":true,"tachikawa.tokyo.jp":true,"taito.tokyo.jp":true,"tama.tokyo.jp":true,"toshima.tokyo.jp":true,"chizu.tottori.jp":true,"hino.tottori.jp":true,"kawahara.tottori.jp":true,"koge.tottori.jp":true,"kotoura.tottori.jp":true,"misasa.tottori.jp":true,"nanbu.tottori.jp":true,"nichinan.tottori.jp":true,"sakaiminato.tottori.jp":true,"tottori.tottori.jp":true,"wakasa.tottori.jp":true,"yazu.tottori.jp":true,"yonago.tottori.jp":true,"asahi.toyama.jp":true,"fuchu.toyama.jp":true,"fukumitsu.toyama.jp":true,"funahashi.toyama.jp":true,"himi.toyama.jp":true,"imizu.toyama.jp":true,"inami.toyama.jp":true,"johana.toyama.jp":true,"kamiichi.toyama.jp":true,"kurobe.toyama.jp":true,"nakaniikawa.toyama.jp":true,"namerikawa.toyama.jp":true,"nanto.toyama.jp":true,"nyuzen.toyama.jp":true,"oyabe.toyama.jp":true,"taira.toyama.jp":true,"takaoka.toyama.jp":true,"tateyama.toyama.jp":true,"toga.toyama.jp":true,"tonami.toyama.jp":true,"toyama.toyama.jp":true,"unazuki.toyama.jp":true,"uozu.toyama.jp":true,"yamada.toyama.jp":true,"arida.wakayama.jp":true,"aridagawa.wakayama.jp":true,"gobo.wakayama.jp":true,"hashimoto.wakayama.jp":true,"hidaka.wakayama.jp":true,"hirogawa.wakayama.jp":true,"inami.wakayama.jp":true,"iwade.wakayama.jp":true,"kainan.wakayama.jp":true,"kamitonda.wakayama.jp":true,"katsuragi.wakayama.jp":true,"kimino.wakayama.jp":true,"kinokawa.wakayama.jp":true,"kitayama.wakayama.jp":true,"koya.wakayama.jp":true,"koza.wakayama.jp":true,"kozagawa.wakayama.jp":true,"kudoyama.wakayama.jp":true,"kushimoto.wakayama.jp":true,"mihama.wakayama.jp":true,"misato.wakayama.jp":true,"nachikatsuura.wakayama.jp":true,"shingu.wakayama.jp":true,"shirahama.wakayama.jp":true,"taiji.wakayama.jp":true,"tanabe.wakayama.jp":true,"wakayama.wakayama.jp":true,"yuasa.wakayama.jp":true,"yura.wakayama.jp":true,"asahi.yamagata.jp":true,"funagata.yamagata.jp":true,"higashine.yamagata.jp":true,"iide.yamagata.jp":true,"kahoku.yamagata.jp":true,"kaminoyama.yamagata.jp":true,"kaneyama.yamagata.jp":true,"kawanishi.yamagata.jp":true,"mamurogawa.yamagata.jp":true,"mikawa.yamagata.jp":true,"murayama.yamagata.jp":true,"nagai.yamagata.jp":true,"nakayama.yamagata.jp":true,"nanyo.yamagata.jp":true,"nishikawa.yamagata.jp":true,"obanazawa.yamagata.jp":true,"oe.yamagata.jp":true,"oguni.yamagata.jp":true,"ohkura.yamagata.jp":true,"oishida.yamagata.jp":true,"sagae.yamagata.jp":true,"sakata.yamagata.jp":true,"sakegawa.yamagata.jp":true,"shinjo.yamagata.jp":true,"shirataka.yamagata.jp":true,"shonai.yamagata.jp":true,"takahata.yamagata.jp":true,"tendo.yamagata.jp":true,"tozawa.yamagata.jp":true,"tsuruoka.yamagata.jp":true,"yamagata.yamagata.jp":true,"yamanobe.yamagata.jp":true,"yonezawa.yamagata.jp":true,"yuza.yamagata.jp":true,"abu.yamaguchi.jp":true,"hagi.yamaguchi.jp":true,"hikari.yamaguchi.jp":true,"hofu.yamaguchi.jp":true,"iwakuni.yamaguchi.jp":true,"kudamatsu.yamaguchi.jp":true,"mitou.yamaguchi.jp":true,"nagato.yamaguchi.jp":true,"oshima.yamaguchi.jp":true,"shimonoseki.yamaguchi.jp":true,"shunan.yamaguchi.jp":true,"tabuse.yamaguchi.jp":true,"tokuyama.yamaguchi.jp":true,"toyota.yamaguchi.jp":true,"ube.yamaguchi.jp":true,"yuu.yamaguchi.jp":true,"chuo.yamanashi.jp":true,"doshi.yamanashi.jp":true,"fuefuki.yamanashi.jp":true,"fujikawa.yamanashi.jp":true,"fujikawaguchiko.yamanashi.jp":true,"fujiyoshida.yamanashi.jp":true,"hayakawa.yamanashi.jp":true,"hokuto.yamanashi.jp":true,"ichikawamisato.yamanashi.jp":true,"kai.yamanashi.jp":true,"kofu.yamanashi.jp":true,"koshu.yamanashi.jp":true,"kosuge.yamanashi.jp":true,"minami-alps.yamanashi.jp":true,"minobu.yamanashi.jp":true,"nakamichi.yamanashi.jp":true,"nanbu.yamanashi.jp":true,"narusawa.yamanashi.jp":true,"nirasaki.yamanashi.jp":true,"nishikatsura.yamanashi.jp":true,"oshino.yamanashi.jp":true,"otsuki.yamanashi.jp":true,"showa.yamanashi.jp":true,"tabayama.yamanashi.jp":true,"tsuru.yamanashi.jp":true,"uenohara.yamanashi.jp":true,"yamanakako.yamanashi.jp":true,"yamanashi.yamanashi.jp":true,"*.ke":true,"kg":true,"org.kg":true,"net.kg":true,"com.kg":true,"edu.kg":true,"gov.kg":true,"mil.kg":true,"*.kh":true,"ki":true,"edu.ki":true,"biz.ki":true,"net.ki":true,"org.ki":true,"gov.ki":true,"info.ki":true,"com.ki":true,"km":true,"org.km":true,"nom.km":true,"gov.km":true,"prd.km":true,"tm.km":true,"edu.km":true,"mil.km":true,"ass.km":true,"com.km":true,"coop.km":true,"asso.km":true,"presse.km":true,"medecin.km":true,"notaires.km":true,"pharmaciens.km":true,"veterinaire.km":true,"gouv.km":true,"kn":true,"net.kn":true,"org.kn":true,"edu.kn":true,"gov.kn":true,"kp":true,"com.kp":true,"edu.kp":true,"gov.kp":true,"org.kp":true,"rep.kp":true,"tra.kp":true,"kr":true,"ac.kr":true,"co.kr":true,"es.kr":true,"go.kr":true,"hs.kr":true,"kg.kr":true,"mil.kr":true,"ms.kr":true,"ne.kr":true,"or.kr":true,"pe.kr":true,"re.kr":true,"sc.kr":true,"busan.kr":true,"chungbuk.kr":true,"chungnam.kr":true,"daegu.kr":true,"daejeon.kr":true,"gangwon.kr":true,"gwangju.kr":true,"gyeongbuk.kr":true,"gyeonggi.kr":true,"gyeongnam.kr":true,"incheon.kr":true,"jeju.kr":true,"jeonbuk.kr":true,"jeonnam.kr":true,"seoul.kr":true,"ulsan.kr":true,"*.kw":true,"ky":true,"edu.ky":true,"gov.ky":true,"com.ky":true,"org.ky":true,"net.ky":true,"kz":true,"org.kz":true,"edu.kz":true,"net.kz":true,"gov.kz":true,"mil.kz":true,"com.kz":true,"la":true,"int.la":true,"net.la":true,"info.la":true,"edu.la":true,"gov.la":true,"per.la":true,"com.la":true,"org.la":true,"lb":true,"com.lb":true,"edu.lb":true,"gov.lb":true,"net.lb":true,"org.lb":true,"lc":true,"com.lc":true,"net.lc":true,"co.lc":true,"org.lc":true,"edu.lc":true,"gov.lc":true,"li":true,"lk":true,"gov.lk":true,"sch.lk":true,"net.lk":true,"int.lk":true,"com.lk":true,"org.lk":true,"edu.lk":true,"ngo.lk":true,"soc.lk":true,"web.lk":true,"ltd.lk":true,"assn.lk":true,"grp.lk":true,"hotel.lk":true,"lr":true,"com.lr":true,"edu.lr":true,"gov.lr":true,"org.lr":true,"net.lr":true,"ls":true,"co.ls":true,"org.ls":true,"lt":true,"gov.lt":true,"lu":true,"lv":true,"com.lv":true,"edu.lv":true,"gov.lv":true,"org.lv":true,"mil.lv":true,"id.lv":true,"net.lv":true,"asn.lv":true,"conf.lv":true,"ly":true,"com.ly":true,"net.ly":true,"gov.ly":true,"plc.ly":true,"edu.ly":true,"sch.ly":true,"med.ly":true,"org.ly":true,"id.ly":true,"ma":true,"co.ma":true,"net.ma":true,"gov.ma":true,"org.ma":true,"ac.ma":true,"press.ma":true,"mc":true,"tm.mc":true,"asso.mc":true,"md":true,"me":true,"co.me":true,"net.me":true,"org.me":true,"edu.me":true,"ac.me":true,"gov.me":true,"its.me":true,"priv.me":true,"mg":true,"org.mg":true,"nom.mg":true,"gov.mg":true,"prd.mg":true,"tm.mg":true,"edu.mg":true,"mil.mg":true,"com.mg":true,"mh":true,"mil":true,"mk":true,"com.mk":true,"org.mk":true,"net.mk":true,"edu.mk":true,"gov.mk":true,"inf.mk":true,"name.mk":true,"ml":true,"com.ml":true,"edu.ml":true,"gouv.ml":true,"gov.ml":true,"net.ml":true,"org.ml":true,"presse.ml":true,"*.mm":true,"mn":true,"gov.mn":true,"edu.mn":true,"org.mn":true,"mo":true,"com.mo":true,"net.mo":true,"org.mo":true,"edu.mo":true,"gov.mo":true,"mobi":true,"mp":true,"mq":true,"mr":true,"gov.mr":true,"ms":true,"com.ms":true,"edu.ms":true,"gov.ms":true,"net.ms":true,"org.ms":true,"mt":true,"com.mt":true,"edu.mt":true,"net.mt":true,"org.mt":true,"mu":true,"com.mu":true,"net.mu":true,"org.mu":true,"gov.mu":true,"ac.mu":true,"co.mu":true,"or.mu":true,"museum":true,"academy.museum":true,"agriculture.museum":true,"air.museum":true,"airguard.museum":true,"alabama.museum":true,"alaska.museum":true,"amber.museum":true,"ambulance.museum":true,"american.museum":true,"americana.museum":true,"americanantiques.museum":true,"americanart.museum":true,"amsterdam.museum":true,"and.museum":true,"annefrank.museum":true,"anthro.museum":true,"anthropology.museum":true,"antiques.museum":true,"aquarium.museum":true,"arboretum.museum":true,"archaeological.museum":true,"archaeology.museum":true,"architecture.museum":true,"art.museum":true,"artanddesign.museum":true,"artcenter.museum":true,"artdeco.museum":true,"arteducation.museum":true,"artgallery.museum":true,"arts.museum":true,"artsandcrafts.museum":true,"asmatart.museum":true,"assassination.museum":true,"assisi.museum":true,"association.museum":true,"astronomy.museum":true,"atlanta.museum":true,"austin.museum":true,"australia.museum":true,"automotive.museum":true,"aviation.museum":true,"axis.museum":true,"badajoz.museum":true,"baghdad.museum":true,"bahn.museum":true,"bale.museum":true,"baltimore.museum":true,"barcelona.museum":true,"baseball.museum":true,"basel.museum":true,"baths.museum":true,"bauern.museum":true,"beauxarts.museum":true,"beeldengeluid.museum":true,"bellevue.museum":true,"bergbau.museum":true,"berkeley.museum":true,"berlin.museum":true,"bern.museum":true,"bible.museum":true,"bilbao.museum":true,"bill.museum":true,"birdart.museum":true,"birthplace.museum":true,"bonn.museum":true,"boston.museum":true,"botanical.museum":true,"botanicalgarden.museum":true,"botanicgarden.museum":true,"botany.museum":true,"brandywinevalley.museum":true,"brasil.museum":true,"bristol.museum":true,"british.museum":true,"britishcolumbia.museum":true,"broadcast.museum":true,"brunel.museum":true,"brussel.museum":true,"brussels.museum":true,"bruxelles.museum":true,"building.museum":true,"burghof.museum":true,"bus.museum":true,"bushey.museum":true,"cadaques.museum":true,"california.museum":true,"cambridge.museum":true,"can.museum":true,"canada.museum":true,"capebreton.museum":true,"carrier.museum":true,"cartoonart.museum":true,"casadelamoneda.museum":true,"castle.museum":true,"castres.museum":true,"celtic.museum":true,"center.museum":true,"chattanooga.museum":true,"cheltenham.museum":true,"chesapeakebay.museum":true,"chicago.museum":true,"children.museum":true,"childrens.museum":true,"childrensgarden.museum":true,"chiropractic.museum":true,"chocolate.museum":true,"christiansburg.museum":true,"cincinnati.museum":true,"cinema.museum":true,"circus.museum":true,"civilisation.museum":true,"civilization.museum":true,"civilwar.museum":true,"clinton.museum":true,"clock.museum":true,"coal.museum":true,"coastaldefence.museum":true,"cody.museum":true,"coldwar.museum":true,"collection.museum":true,"colonialwilliamsburg.museum":true,"coloradoplateau.museum":true,"columbia.museum":true,"columbus.museum":true,"communication.museum":true,"communications.museum":true,"community.museum":true,"computer.museum":true,"computerhistory.museum":true,"xn--comunicaes-v6a2o.museum":true,"contemporary.museum":true,"contemporaryart.museum":true,"convent.museum":true,"copenhagen.museum":true,"corporation.museum":true,"xn--correios-e-telecomunicaes-ghc29a.museum":true,"corvette.museum":true,"costume.museum":true,"countryestate.museum":true,"county.museum":true,"crafts.museum":true,"cranbrook.museum":true,"creation.museum":true,"cultural.museum":true,"culturalcenter.museum":true,"culture.museum":true,"cyber.museum":true,"cymru.museum":true,"dali.museum":true,"dallas.museum":true,"database.museum":true,"ddr.museum":true,"decorativearts.museum":true,"delaware.museum":true,"delmenhorst.museum":true,"denmark.museum":true,"depot.museum":true,"design.museum":true,"detroit.museum":true,"dinosaur.museum":true,"discovery.museum":true,"dolls.museum":true,"donostia.museum":true,"durham.museum":true,"eastafrica.museum":true,"eastcoast.museum":true,"education.museum":true,"educational.museum":true,"egyptian.museum":true,"eisenbahn.museum":true,"elburg.museum":true,"elvendrell.museum":true,"embroidery.museum":true,"encyclopedic.museum":true,"england.museum":true,"entomology.museum":true,"environment.museum":true,"environmentalconservation.museum":true,"epilepsy.museum":true,"essex.museum":true,"estate.museum":true,"ethnology.museum":true,"exeter.museum":true,"exhibition.museum":true,"family.museum":true,"farm.museum":true,"farmequipment.museum":true,"farmers.museum":true,"farmstead.museum":true,"field.museum":true,"figueres.museum":true,"filatelia.museum":true,"film.museum":true,"fineart.museum":true,"finearts.museum":true,"finland.museum":true,"flanders.museum":true,"florida.museum":true,"force.museum":true,"fortmissoula.museum":true,"fortworth.museum":true,"foundation.museum":true,"francaise.museum":true,"frankfurt.museum":true,"franziskaner.museum":true,"freemasonry.museum":true,"freiburg.museum":true,"fribourg.museum":true,"frog.museum":true,"fundacio.museum":true,"furniture.museum":true,"gallery.museum":true,"garden.museum":true,"gateway.museum":true,"geelvinck.museum":true,"gemological.museum":true,"geology.museum":true,"georgia.museum":true,"giessen.museum":true,"glas.museum":true,"glass.museum":true,"gorge.museum":true,"grandrapids.museum":true,"graz.museum":true,"guernsey.museum":true,"halloffame.museum":true,"hamburg.museum":true,"handson.museum":true,"harvestcelebration.museum":true,"hawaii.museum":true,"health.museum":true,"heimatunduhren.museum":true,"hellas.museum":true,"helsinki.museum":true,"hembygdsforbund.museum":true,"heritage.museum":true,"histoire.museum":true,"historical.museum":true,"historicalsociety.museum":true,"historichouses.museum":true,"historisch.museum":true,"historisches.museum":true,"history.museum":true,"historyofscience.museum":true,"horology.museum":true,"house.museum":true,"humanities.museum":true,"illustration.museum":true,"imageandsound.museum":true,"indian.museum":true,"indiana.museum":true,"indianapolis.museum":true,"indianmarket.museum":true,"intelligence.museum":true,"interactive.museum":true,"iraq.museum":true,"iron.museum":true,"isleofman.museum":true,"jamison.museum":true,"jefferson.museum":true,"jerusalem.museum":true,"jewelry.museum":true,"jewish.museum":true,"jewishart.museum":true,"jfk.museum":true,"journalism.museum":true,"judaica.museum":true,"judygarland.museum":true,"juedisches.museum":true,"juif.museum":true,"karate.museum":true,"karikatur.museum":true,"kids.museum":true,"koebenhavn.museum":true,"koeln.museum":true,"kunst.museum":true,"kunstsammlung.museum":true,"kunstunddesign.museum":true,"labor.museum":true,"labour.museum":true,"lajolla.museum":true,"lancashire.museum":true,"landes.museum":true,"lans.museum":true,"xn--lns-qla.museum":true,"larsson.museum":true,"lewismiller.museum":true,"lincoln.museum":true,"linz.museum":true,"living.museum":true,"livinghistory.museum":true,"localhistory.museum":true,"london.museum":true,"losangeles.museum":true,"louvre.museum":true,"loyalist.museum":true,"lucerne.museum":true,"luxembourg.museum":true,"luzern.museum":true,"mad.museum":true,"madrid.museum":true,"mallorca.museum":true,"manchester.museum":true,"mansion.museum":true,"mansions.museum":true,"manx.museum":true,"marburg.museum":true,"maritime.museum":true,"maritimo.museum":true,"maryland.museum":true,"marylhurst.museum":true,"media.museum":true,"medical.museum":true,"medizinhistorisches.museum":true,"meeres.museum":true,"memorial.museum":true,"mesaverde.museum":true,"michigan.museum":true,"midatlantic.museum":true,"military.museum":true,"mill.museum":true,"miners.museum":true,"mining.museum":true,"minnesota.museum":true,"missile.museum":true,"missoula.museum":true,"modern.museum":true,"moma.museum":true,"money.museum":true,"monmouth.museum":true,"monticello.museum":true,"montreal.museum":true,"moscow.museum":true,"motorcycle.museum":true,"muenchen.museum":true,"muenster.museum":true,"mulhouse.museum":true,"muncie.museum":true,"museet.museum":true,"museumcenter.museum":true,"museumvereniging.museum":true,"music.museum":true,"national.museum":true,"nationalfirearms.museum":true,"nationalheritage.museum":true,"nativeamerican.museum":true,"naturalhistory.museum":true,"naturalhistorymuseum.museum":true,"naturalsciences.museum":true,"nature.museum":true,"naturhistorisches.museum":true,"natuurwetenschappen.museum":true,"naumburg.museum":true,"naval.museum":true,"nebraska.museum":true,"neues.museum":true,"newhampshire.museum":true,"newjersey.museum":true,"newmexico.museum":true,"newport.museum":true,"newspaper.museum":true,"newyork.museum":true,"niepce.museum":true,"norfolk.museum":true,"north.museum":true,"nrw.museum":true,"nuernberg.museum":true,"nuremberg.museum":true,"nyc.museum":true,"nyny.museum":true,"oceanographic.museum":true,"oceanographique.museum":true,"omaha.museum":true,"online.museum":true,"ontario.museum":true,"openair.museum":true,"oregon.museum":true,"oregontrail.museum":true,"otago.museum":true,"oxford.museum":true,"pacific.museum":true,"paderborn.museum":true,"palace.museum":true,"paleo.museum":true,"palmsprings.museum":true,"panama.museum":true,"paris.museum":true,"pasadena.museum":true,"pharmacy.museum":true,"philadelphia.museum":true,"philadelphiaarea.museum":true,"philately.museum":true,"phoenix.museum":true,"photography.museum":true,"pilots.museum":true,"pittsburgh.museum":true,"planetarium.museum":true,"plantation.museum":true,"plants.museum":true,"plaza.museum":true,"portal.museum":true,"portland.museum":true,"portlligat.museum":true,"posts-and-telecommunications.museum":true,"preservation.museum":true,"presidio.museum":true,"press.museum":true,"project.museum":true,"public.museum":true,"pubol.museum":true,"quebec.museum":true,"railroad.museum":true,"railway.museum":true,"research.museum":true,"resistance.museum":true,"riodejaneiro.museum":true,"rochester.museum":true,"rockart.museum":true,"roma.museum":true,"russia.museum":true,"saintlouis.museum":true,"salem.museum":true,"salvadordali.museum":true,"salzburg.museum":true,"sandiego.museum":true,"sanfrancisco.museum":true,"santabarbara.museum":true,"santacruz.museum":true,"santafe.museum":true,"saskatchewan.museum":true,"satx.museum":true,"savannahga.museum":true,"schlesisches.museum":true,"schoenbrunn.museum":true,"schokoladen.museum":true,"school.museum":true,"schweiz.museum":true,"science.museum":true,"scienceandhistory.museum":true,"scienceandindustry.museum":true,"sciencecenter.museum":true,"sciencecenters.museum":true,"science-fiction.museum":true,"sciencehistory.museum":true,"sciences.museum":true,"sciencesnaturelles.museum":true,"scotland.museum":true,"seaport.museum":true,"settlement.museum":true,"settlers.museum":true,"shell.museum":true,"sherbrooke.museum":true,"sibenik.museum":true,"silk.museum":true,"ski.museum":true,"skole.museum":true,"society.museum":true,"sologne.museum":true,"soundandvision.museum":true,"southcarolina.museum":true,"southwest.museum":true,"space.museum":true,"spy.museum":true,"square.museum":true,"stadt.museum":true,"stalbans.museum":true,"starnberg.museum":true,"state.museum":true,"stateofdelaware.museum":true,"station.museum":true,"steam.museum":true,"steiermark.museum":true,"stjohn.museum":true,"stockholm.museum":true,"stpetersburg.museum":true,"stuttgart.museum":true,"suisse.museum":true,"surgeonshall.museum":true,"surrey.museum":true,"svizzera.museum":true,"sweden.museum":true,"sydney.museum":true,"tank.museum":true,"tcm.museum":true,"technology.museum":true,"telekommunikation.museum":true,"television.museum":true,"texas.museum":true,"textile.museum":true,"theater.museum":true,"time.museum":true,"timekeeping.museum":true,"topology.museum":true,"torino.museum":true,"touch.museum":true,"town.museum":true,"transport.museum":true,"tree.museum":true,"trolley.museum":true,"trust.museum":true,"trustee.museum":true,"uhren.museum":true,"ulm.museum":true,"undersea.museum":true,"university.museum":true,"usa.museum":true,"usantiques.museum":true,"usarts.museum":true,"uscountryestate.museum":true,"usculture.museum":true,"usdecorativearts.museum":true,"usgarden.museum":true,"ushistory.museum":true,"ushuaia.museum":true,"uslivinghistory.museum":true,"utah.museum":true,"uvic.museum":true,"valley.museum":true,"vantaa.museum":true,"versailles.museum":true,"viking.museum":true,"village.museum":true,"virginia.museum":true,"virtual.museum":true,"virtuel.museum":true,"vlaanderen.museum":true,"volkenkunde.museum":true,"wales.museum":true,"wallonie.museum":true,"war.museum":true,"washingtondc.museum":true,"watchandclock.museum":true,"watch-and-clock.museum":true,"western.museum":true,"westfalen.museum":true,"whaling.museum":true,"wildlife.museum":true,"williamsburg.museum":true,"windmill.museum":true,"workshop.museum":true,"york.museum":true,"yorkshire.museum":true,"yosemite.museum":true,"youth.museum":true,"zoological.museum":true,"zoology.museum":true,"xn--9dbhblg6di.museum":true,"xn--h1aegh.museum":true,"mv":true,"aero.mv":true,"biz.mv":true,"com.mv":true,"coop.mv":true,"edu.mv":true,"gov.mv":true,"info.mv":true,"int.mv":true,"mil.mv":true,"museum.mv":true,"name.mv":true,"net.mv":true,"org.mv":true,"pro.mv":true,"mw":true,"ac.mw":true,"biz.mw":true,"co.mw":true,"com.mw":true,"coop.mw":true,"edu.mw":true,"gov.mw":true,"int.mw":true,"museum.mw":true,"net.mw":true,"org.mw":true,"mx":true,"com.mx":true,"org.mx":true,"gob.mx":true,"edu.mx":true,"net.mx":true,"my":true,"com.my":true,"net.my":true,"org.my":true,"gov.my":true,"edu.my":true,"mil.my":true,"name.my":true,"*.mz":true,"teledata.mz":false,"na":true,"info.na":true,"pro.na":true,"name.na":true,"school.na":true,"or.na":true,"dr.na":true,"us.na":true,"mx.na":true,"ca.na":true,"in.na":true,"cc.na":true,"tv.na":true,"ws.na":true,"mobi.na":true,"co.na":true,"com.na":true,"org.na":true,"name":true,"nc":true,"asso.nc":true,"ne":true,"net":true,"nf":true,"com.nf":true,"net.nf":true,"per.nf":true,"rec.nf":true,"web.nf":true,"arts.nf":true,"firm.nf":true,"info.nf":true,"other.nf":true,"store.nf":true,"ng":true,"com.ng":true,"edu.ng":true,"name.ng":true,"net.ng":true,"org.ng":true,"sch.ng":true,"gov.ng":true,"mil.ng":true,"mobi.ng":true,"*.ni":true,"nl":true,"bv.nl":true,"no":true,"fhs.no":true,"vgs.no":true,"fylkesbibl.no":true,"folkebibl.no":true,"museum.no":true,"idrett.no":true,"priv.no":true,"mil.no":true,"stat.no":true,"dep.no":true,"kommune.no":true,"herad.no":true,"aa.no":true,"ah.no":true,"bu.no":true,"fm.no":true,"hl.no":true,"hm.no":true,"jan-mayen.no":true,"mr.no":true,"nl.no":true,"nt.no":true,"of.no":true,"ol.no":true,"oslo.no":true,"rl.no":true,"sf.no":true,"st.no":true,"svalbard.no":true,"tm.no":true,"tr.no":true,"va.no":true,"vf.no":true,"gs.aa.no":true,"gs.ah.no":true,"gs.bu.no":true,"gs.fm.no":true,"gs.hl.no":true,"gs.hm.no":true,"gs.jan-mayen.no":true,"gs.mr.no":true,"gs.nl.no":true,"gs.nt.no":true,"gs.of.no":true,"gs.ol.no":true,"gs.oslo.no":true,"gs.rl.no":true,"gs.sf.no":true,"gs.st.no":true,"gs.svalbard.no":true,"gs.tm.no":true,"gs.tr.no":true,"gs.va.no":true,"gs.vf.no":true,"akrehamn.no":true,"xn--krehamn-dxa.no":true,"algard.no":true,"xn--lgrd-poac.no":true,"arna.no":true,"brumunddal.no":true,"bryne.no":true,"bronnoysund.no":true,"xn--brnnysund-m8ac.no":true,"drobak.no":true,"xn--drbak-wua.no":true,"egersund.no":true,"fetsund.no":true,"floro.no":true,"xn--flor-jra.no":true,"fredrikstad.no":true,"hokksund.no":true,"honefoss.no":true,"xn--hnefoss-q1a.no":true,"jessheim.no":true,"jorpeland.no":true,"xn--jrpeland-54a.no":true,"kirkenes.no":true,"kopervik.no":true,"krokstadelva.no":true,"langevag.no":true,"xn--langevg-jxa.no":true,"leirvik.no":true,"mjondalen.no":true,"xn--mjndalen-64a.no":true,"mo-i-rana.no":true,"mosjoen.no":true,"xn--mosjen-eya.no":true,"nesoddtangen.no":true,"orkanger.no":true,"osoyro.no":true,"xn--osyro-wua.no":true,"raholt.no":true,"xn--rholt-mra.no":true,"sandnessjoen.no":true,"xn--sandnessjen-ogb.no":true,"skedsmokorset.no":true,"slattum.no":true,"spjelkavik.no":true,"stathelle.no":true,"stavern.no":true,"stjordalshalsen.no":true,"xn--stjrdalshalsen-sqb.no":true,"tananger.no":true,"tranby.no":true,"vossevangen.no":true,"afjord.no":true,"xn--fjord-lra.no":true,"agdenes.no":true,"al.no":true,"xn--l-1fa.no":true,"alesund.no":true,"xn--lesund-hua.no":true,"alstahaug.no":true,"alta.no":true,"xn--lt-liac.no":true,"alaheadju.no":true,"xn--laheadju-7ya.no":true,"alvdal.no":true,"amli.no":true,"xn--mli-tla.no":true,"amot.no":true,"xn--mot-tla.no":true,"andebu.no":true,"andoy.no":true,"xn--andy-ira.no":true,"andasuolo.no":true,"ardal.no":true,"xn--rdal-poa.no":true,"aremark.no":true,"arendal.no":true,"xn--s-1fa.no":true,"aseral.no":true,"xn--seral-lra.no":true,"asker.no":true,"askim.no":true,"askvoll.no":true,"askoy.no":true,"xn--asky-ira.no":true,"asnes.no":true,"xn--snes-poa.no":true,"audnedaln.no":true,"aukra.no":true,"aure.no":true,"aurland.no":true,"aurskog-holand.no":true,"xn--aurskog-hland-jnb.no":true,"austevoll.no":true,"austrheim.no":true,"averoy.no":true,"xn--avery-yua.no":true,"balestrand.no":true,"ballangen.no":true,"balat.no":true,"xn--blt-elab.no":true,"balsfjord.no":true,"bahccavuotna.no":true,"xn--bhccavuotna-k7a.no":true,"bamble.no":true,"bardu.no":true,"beardu.no":true,"beiarn.no":true,"bajddar.no":true,"xn--bjddar-pta.no":true,"baidar.no":true,"xn--bidr-5nac.no":true,"berg.no":true,"bergen.no":true,"berlevag.no":true,"xn--berlevg-jxa.no":true,"bearalvahki.no":true,"xn--bearalvhki-y4a.no":true,"bindal.no":true,"birkenes.no":true,"bjarkoy.no":true,"xn--bjarky-fya.no":true,"bjerkreim.no":true,"bjugn.no":true,"bodo.no":true,"xn--bod-2na.no":true,"badaddja.no":true,"xn--bdddj-mrabd.no":true,"budejju.no":true,"bokn.no":true,"bremanger.no":true,"bronnoy.no":true,"xn--brnny-wuac.no":true,"bygland.no":true,"bykle.no":true,"barum.no":true,"xn--brum-voa.no":true,"bo.telemark.no":true,"xn--b-5ga.telemark.no":true,"bo.nordland.no":true,"xn--b-5ga.nordland.no":true,"bievat.no":true,"xn--bievt-0qa.no":true,"bomlo.no":true,"xn--bmlo-gra.no":true,"batsfjord.no":true,"xn--btsfjord-9za.no":true,"bahcavuotna.no":true,"xn--bhcavuotna-s4a.no":true,"dovre.no":true,"drammen.no":true,"drangedal.no":true,"dyroy.no":true,"xn--dyry-ira.no":true,"donna.no":true,"xn--dnna-gra.no":true,"eid.no":true,"eidfjord.no":true,"eidsberg.no":true,"eidskog.no":true,"eidsvoll.no":true,"eigersund.no":true,"elverum.no":true,"enebakk.no":true,"engerdal.no":true,"etne.no":true,"etnedal.no":true,"evenes.no":true,"evenassi.no":true,"xn--eveni-0qa01ga.no":true,"evje-og-hornnes.no":true,"farsund.no":true,"fauske.no":true,"fuossko.no":true,"fuoisku.no":true,"fedje.no":true,"fet.no":true,"finnoy.no":true,"xn--finny-yua.no":true,"fitjar.no":true,"fjaler.no":true,"fjell.no":true,"flakstad.no":true,"flatanger.no":true,"flekkefjord.no":true,"flesberg.no":true,"flora.no":true,"fla.no":true,"xn--fl-zia.no":true,"folldal.no":true,"forsand.no":true,"fosnes.no":true,"frei.no":true,"frogn.no":true,"froland.no":true,"frosta.no":true,"frana.no":true,"xn--frna-woa.no":true,"froya.no":true,"xn--frya-hra.no":true,"fusa.no":true,"fyresdal.no":true,"forde.no":true,"xn--frde-gra.no":true,"gamvik.no":true,"gangaviika.no":true,"xn--ggaviika-8ya47h.no":true,"gaular.no":true,"gausdal.no":true,"gildeskal.no":true,"xn--gildeskl-g0a.no":true,"giske.no":true,"gjemnes.no":true,"gjerdrum.no":true,"gjerstad.no":true,"gjesdal.no":true,"gjovik.no":true,"xn--gjvik-wua.no":true,"gloppen.no":true,"gol.no":true,"gran.no":true,"grane.no":true,"granvin.no":true,"gratangen.no":true,"grimstad.no":true,"grong.no":true,"kraanghke.no":true,"xn--kranghke-b0a.no":true,"grue.no":true,"gulen.no":true,"hadsel.no":true,"halden.no":true,"halsa.no":true,"hamar.no":true,"hamaroy.no":true,"habmer.no":true,"xn--hbmer-xqa.no":true,"hapmir.no":true,"xn--hpmir-xqa.no":true,"hammerfest.no":true,"hammarfeasta.no":true,"xn--hmmrfeasta-s4ac.no":true,"haram.no":true,"hareid.no":true,"harstad.no":true,"hasvik.no":true,"aknoluokta.no":true,"xn--koluokta-7ya57h.no":true,"hattfjelldal.no":true,"aarborte.no":true,"haugesund.no":true,"hemne.no":true,"hemnes.no":true,"hemsedal.no":true,"heroy.more-og-romsdal.no":true,"xn--hery-ira.xn--mre-og-romsdal-qqb.no":true,"heroy.nordland.no":true,"xn--hery-ira.nordland.no":true,"hitra.no":true,"hjartdal.no":true,"hjelmeland.no":true,"hobol.no":true,"xn--hobl-ira.no":true,"hof.no":true,"hol.no":true,"hole.no":true,"holmestrand.no":true,"holtalen.no":true,"xn--holtlen-hxa.no":true,"hornindal.no":true,"horten.no":true,"hurdal.no":true,"hurum.no":true,"hvaler.no":true,"hyllestad.no":true,"hagebostad.no":true,"xn--hgebostad-g3a.no":true,"hoyanger.no":true,"xn--hyanger-q1a.no":true,"hoylandet.no":true,"xn--hylandet-54a.no":true,"ha.no":true,"xn--h-2fa.no":true,"ibestad.no":true,"inderoy.no":true,"xn--indery-fya.no":true,"iveland.no":true,"jevnaker.no":true,"jondal.no":true,"jolster.no":true,"xn--jlster-bya.no":true,"karasjok.no":true,"karasjohka.no":true,"xn--krjohka-hwab49j.no":true,"karlsoy.no":true,"galsa.no":true,"xn--gls-elac.no":true,"karmoy.no":true,"xn--karmy-yua.no":true,"kautokeino.no":true,"guovdageaidnu.no":true,"klepp.no":true,"klabu.no":true,"xn--klbu-woa.no":true,"kongsberg.no":true,"kongsvinger.no":true,"kragero.no":true,"xn--krager-gya.no":true,"kristiansand.no":true,"kristiansund.no":true,"krodsherad.no":true,"xn--krdsherad-m8a.no":true,"kvalsund.no":true,"rahkkeravju.no":true,"xn--rhkkervju-01af.no":true,"kvam.no":true,"kvinesdal.no":true,"kvinnherad.no":true,"kviteseid.no":true,"kvitsoy.no":true,"xn--kvitsy-fya.no":true,"kvafjord.no":true,"xn--kvfjord-nxa.no":true,"giehtavuoatna.no":true,"kvanangen.no":true,"xn--kvnangen-k0a.no":true,"navuotna.no":true,"xn--nvuotna-hwa.no":true,"kafjord.no":true,"xn--kfjord-iua.no":true,"gaivuotna.no":true,"xn--givuotna-8ya.no":true,"larvik.no":true,"lavangen.no":true,"lavagis.no":true,"loabat.no":true,"xn--loabt-0qa.no":true,"lebesby.no":true,"davvesiida.no":true,"leikanger.no":true,"leirfjord.no":true,"leka.no":true,"leksvik.no":true,"lenvik.no":true,"leangaviika.no":true,"xn--leagaviika-52b.no":true,"lesja.no":true,"levanger.no":true,"lier.no":true,"lierne.no":true,"lillehammer.no":true,"lillesand.no":true,"lindesnes.no":true,"lindas.no":true,"xn--linds-pra.no":true,"lom.no":true,"loppa.no":true,"lahppi.no":true,"xn--lhppi-xqa.no":true,"lund.no":true,"lunner.no":true,"luroy.no":true,"xn--lury-ira.no":true,"luster.no":true,"lyngdal.no":true,"lyngen.no":true,"ivgu.no":true,"lardal.no":true,"lerdal.no":true,"xn--lrdal-sra.no":true,"lodingen.no":true,"xn--ldingen-q1a.no":true,"lorenskog.no":true,"xn--lrenskog-54a.no":true,"loten.no":true,"xn--lten-gra.no":true,"malvik.no":true,"masoy.no":true,"xn--msy-ula0h.no":true,"muosat.no":true,"xn--muost-0qa.no":true,"mandal.no":true,"marker.no":true,"marnardal.no":true,"masfjorden.no":true,"meland.no":true,"meldal.no":true,"melhus.no":true,"meloy.no":true,"xn--mely-ira.no":true,"meraker.no":true,"xn--merker-kua.no":true,"moareke.no":true,"xn--moreke-jua.no":true,"midsund.no":true,"midtre-gauldal.no":true,"modalen.no":true,"modum.no":true,"molde.no":true,"moskenes.no":true,"moss.no":true,"mosvik.no":true,"malselv.no":true,"xn--mlselv-iua.no":true,"malatvuopmi.no":true,"xn--mlatvuopmi-s4a.no":true,"namdalseid.no":true,"aejrie.no":true,"namsos.no":true,"namsskogan.no":true,"naamesjevuemie.no":true,"xn--nmesjevuemie-tcba.no":true,"laakesvuemie.no":true,"nannestad.no":true,"narvik.no":true,"narviika.no":true,"naustdal.no":true,"nedre-eiker.no":true,"nes.akershus.no":true,"nes.buskerud.no":true,"nesna.no":true,"nesodden.no":true,"nesseby.no":true,"unjarga.no":true,"xn--unjrga-rta.no":true,"nesset.no":true,"nissedal.no":true,"nittedal.no":true,"nord-aurdal.no":true,"nord-fron.no":true,"nord-odal.no":true,"norddal.no":true,"nordkapp.no":true,"davvenjarga.no":true,"xn--davvenjrga-y4a.no":true,"nordre-land.no":true,"nordreisa.no":true,"raisa.no":true,"xn--risa-5na.no":true,"nore-og-uvdal.no":true,"notodden.no":true,"naroy.no":true,"xn--nry-yla5g.no":true,"notteroy.no":true,"xn--nttery-byae.no":true,"odda.no":true,"oksnes.no":true,"xn--ksnes-uua.no":true,"oppdal.no":true,"oppegard.no":true,"xn--oppegrd-ixa.no":true,"orkdal.no":true,"orland.no":true,"xn--rland-uua.no":true,"orskog.no":true,"xn--rskog-uua.no":true,"orsta.no":true,"xn--rsta-fra.no":true,"os.hedmark.no":true,"os.hordaland.no":true,"osen.no":true,"osteroy.no":true,"xn--ostery-fya.no":true,"ostre-toten.no":true,"xn--stre-toten-zcb.no":true,"overhalla.no":true,"ovre-eiker.no":true,"xn--vre-eiker-k8a.no":true,"oyer.no":true,"xn--yer-zna.no":true,"oygarden.no":true,"xn--ygarden-p1a.no":true,"oystre-slidre.no":true,"xn--ystre-slidre-ujb.no":true,"porsanger.no":true,"porsangu.no":true,"xn--porsgu-sta26f.no":true,"porsgrunn.no":true,"radoy.no":true,"xn--rady-ira.no":true,"rakkestad.no":true,"rana.no":true,"ruovat.no":true,"randaberg.no":true,"rauma.no":true,"rendalen.no":true,"rennebu.no":true,"rennesoy.no":true,"xn--rennesy-v1a.no":true,"rindal.no":true,"ringebu.no":true,"ringerike.no":true,"ringsaker.no":true,"rissa.no":true,"risor.no":true,"xn--risr-ira.no":true,"roan.no":true,"rollag.no":true,"rygge.no":true,"ralingen.no":true,"xn--rlingen-mxa.no":true,"rodoy.no":true,"xn--rdy-0nab.no":true,"romskog.no":true,"xn--rmskog-bya.no":true,"roros.no":true,"xn--rros-gra.no":true,"rost.no":true,"xn--rst-0na.no":true,"royken.no":true,"xn--ryken-vua.no":true,"royrvik.no":true,"xn--ryrvik-bya.no":true,"rade.no":true,"xn--rde-ula.no":true,"salangen.no":true,"siellak.no":true,"saltdal.no":true,"salat.no":true,"xn--slt-elab.no":true,"xn--slat-5na.no":true,"samnanger.no":true,"sande.more-og-romsdal.no":true,"sande.xn--mre-og-romsdal-qqb.no":true,"sande.vestfold.no":true,"sandefjord.no":true,"sandnes.no":true,"sandoy.no":true,"xn--sandy-yua.no":true,"sarpsborg.no":true,"sauda.no":true,"sauherad.no":true,"sel.no":true,"selbu.no":true,"selje.no":true,"seljord.no":true,"sigdal.no":true,"siljan.no":true,"sirdal.no":true,"skaun.no":true,"skedsmo.no":true,"ski.no":true,"skien.no":true,"skiptvet.no":true,"skjervoy.no":true,"xn--skjervy-v1a.no":true,"skierva.no":true,"xn--skierv-uta.no":true,"skjak.no":true,"xn--skjk-soa.no":true,"skodje.no":true,"skanland.no":true,"xn--sknland-fxa.no":true,"skanit.no":true,"xn--sknit-yqa.no":true,"smola.no":true,"xn--smla-hra.no":true,"snillfjord.no":true,"snasa.no":true,"xn--snsa-roa.no":true,"snoasa.no":true,"snaase.no":true,"xn--snase-nra.no":true,"sogndal.no":true,"sokndal.no":true,"sola.no":true,"solund.no":true,"songdalen.no":true,"sortland.no":true,"spydeberg.no":true,"stange.no":true,"stavanger.no":true,"steigen.no":true,"steinkjer.no":true,"stjordal.no":true,"xn--stjrdal-s1a.no":true,"stokke.no":true,"stor-elvdal.no":true,"stord.no":true,"stordal.no":true,"storfjord.no":true,"omasvuotna.no":true,"strand.no":true,"stranda.no":true,"stryn.no":true,"sula.no":true,"suldal.no":true,"sund.no":true,"sunndal.no":true,"surnadal.no":true,"sveio.no":true,"svelvik.no":true,"sykkylven.no":true,"sogne.no":true,"xn--sgne-gra.no":true,"somna.no":true,"xn--smna-gra.no":true,"sondre-land.no":true,"xn--sndre-land-0cb.no":true,"sor-aurdal.no":true,"xn--sr-aurdal-l8a.no":true,"sor-fron.no":true,"xn--sr-fron-q1a.no":true,"sor-odal.no":true,"xn--sr-odal-q1a.no":true,"sor-varanger.no":true,"xn--sr-varanger-ggb.no":true,"matta-varjjat.no":true,"xn--mtta-vrjjat-k7af.no":true,"sorfold.no":true,"xn--srfold-bya.no":true,"sorreisa.no":true,"xn--srreisa-q1a.no":true,"sorum.no":true,"xn--srum-gra.no":true,"tana.no":true,"deatnu.no":true,"time.no":true,"tingvoll.no":true,"tinn.no":true,"tjeldsund.no":true,"dielddanuorri.no":true,"tjome.no":true,"xn--tjme-hra.no":true,"tokke.no":true,"tolga.no":true,"torsken.no":true,"tranoy.no":true,"xn--trany-yua.no":true,"tromso.no":true,"xn--troms-zua.no":true,"tromsa.no":true,"romsa.no":true,"trondheim.no":true,"troandin.no":true,"trysil.no":true,"trana.no":true,"xn--trna-woa.no":true,"trogstad.no":true,"xn--trgstad-r1a.no":true,"tvedestrand.no":true,"tydal.no":true,"tynset.no":true,"tysfjord.no":true,"divtasvuodna.no":true,"divttasvuotna.no":true,"tysnes.no":true,"tysvar.no":true,"xn--tysvr-vra.no":true,"tonsberg.no":true,"xn--tnsberg-q1a.no":true,"ullensaker.no":true,"ullensvang.no":true,"ulvik.no":true,"utsira.no":true,"vadso.no":true,"xn--vads-jra.no":true,"cahcesuolo.no":true,"xn--hcesuolo-7ya35b.no":true,"vaksdal.no":true,"valle.no":true,"vang.no":true,"vanylven.no":true,"vardo.no":true,"xn--vard-jra.no":true,"varggat.no":true,"xn--vrggt-xqad.no":true,"vefsn.no":true,"vaapste.no":true,"vega.no":true,"vegarshei.no":true,"xn--vegrshei-c0a.no":true,"vennesla.no":true,"verdal.no":true,"verran.no":true,"vestby.no":true,"vestnes.no":true,"vestre-slidre.no":true,"vestre-toten.no":true,"vestvagoy.no":true,"xn--vestvgy-ixa6o.no":true,"vevelstad.no":true,"vik.no":true,"vikna.no":true,"vindafjord.no":true,"volda.no":true,"voss.no":true,"varoy.no":true,"xn--vry-yla5g.no":true,"vagan.no":true,"xn--vgan-qoa.no":true,"voagat.no":true,"vagsoy.no":true,"xn--vgsy-qoa0j.no":true,"vaga.no":true,"xn--vg-yiab.no":true,"valer.ostfold.no":true,"xn--vler-qoa.xn--stfold-9xa.no":true,"valer.hedmark.no":true,"xn--vler-qoa.hedmark.no":true,"*.np":true,"nr":true,"biz.nr":true,"info.nr":true,"gov.nr":true,"edu.nr":true,"org.nr":true,"net.nr":true,"com.nr":true,"nu":true,"nz":true,"ac.nz":true,"co.nz":true,"cri.nz":true,"geek.nz":true,"gen.nz":true,"govt.nz":true,"health.nz":true,"iwi.nz":true,"kiwi.nz":true,"maori.nz":true,"mil.nz":true,"xn--mori-qsa.nz":true,"net.nz":true,"org.nz":true,"parliament.nz":true,"school.nz":true,"om":true,"co.om":true,"com.om":true,"edu.om":true,"gov.om":true,"med.om":true,"museum.om":true,"net.om":true,"org.om":true,"pro.om":true,"org":true,"pa":true,"ac.pa":true,"gob.pa":true,"com.pa":true,"org.pa":true,"sld.pa":true,"edu.pa":true,"net.pa":true,"ing.pa":true,"abo.pa":true,"med.pa":true,"nom.pa":true,"pe":true,"edu.pe":true,"gob.pe":true,"nom.pe":true,"mil.pe":true,"org.pe":true,"com.pe":true,"net.pe":true,"pf":true,"com.pf":true,"org.pf":true,"edu.pf":true,"*.pg":true,"ph":true,"com.ph":true,"net.ph":true,"org.ph":true,"gov.ph":true,"edu.ph":true,"ngo.ph":true,"mil.ph":true,"i.ph":true,"pk":true,"com.pk":true,"net.pk":true,"edu.pk":true,"org.pk":true,"fam.pk":true,"biz.pk":true,"web.pk":true,"gov.pk":true,"gob.pk":true,"gok.pk":true,"gon.pk":true,"gop.pk":true,"gos.pk":true,"info.pk":true,"pl":true,"com.pl":true,"net.pl":true,"org.pl":true,"info.pl":true,"waw.pl":true,"gov.pl":true,"aid.pl":true,"agro.pl":true,"atm.pl":true,"auto.pl":true,"biz.pl":true,"edu.pl":true,"gmina.pl":true,"gsm.pl":true,"mail.pl":true,"miasta.pl":true,"media.pl":true,"mil.pl":true,"nieruchomosci.pl":true,"nom.pl":true,"pc.pl":true,"powiat.pl":true,"priv.pl":true,"realestate.pl":true,"rel.pl":true,"sex.pl":true,"shop.pl":true,"sklep.pl":true,"sos.pl":true,"szkola.pl":true,"targi.pl":true,"tm.pl":true,"tourism.pl":true,"travel.pl":true,"turystyka.pl":true,"uw.gov.pl":true,"um.gov.pl":true,"ug.gov.pl":true,"upow.gov.pl":true,"starostwo.gov.pl":true,"so.gov.pl":true,"sr.gov.pl":true,"po.gov.pl":true,"pa.gov.pl":true,"augustow.pl":true,"babia-gora.pl":true,"bedzin.pl":true,"beskidy.pl":true,"bialowieza.pl":true,"bialystok.pl":true,"bielawa.pl":true,"bieszczady.pl":true,"boleslawiec.pl":true,"bydgoszcz.pl":true,"bytom.pl":true,"cieszyn.pl":true,"czeladz.pl":true,"czest.pl":true,"dlugoleka.pl":true,"elblag.pl":true,"elk.pl":true,"glogow.pl":true,"gniezno.pl":true,"gorlice.pl":true,"grajewo.pl":true,"ilawa.pl":true,"jaworzno.pl":true,"jelenia-gora.pl":true,"jgora.pl":true,"kalisz.pl":true,"kazimierz-dolny.pl":true,"karpacz.pl":true,"kartuzy.pl":true,"kaszuby.pl":true,"katowice.pl":true,"kepno.pl":true,"ketrzyn.pl":true,"klodzko.pl":true,"kobierzyce.pl":true,"kolobrzeg.pl":true,"konin.pl":true,"konskowola.pl":true,"kutno.pl":true,"lapy.pl":true,"lebork.pl":true,"legnica.pl":true,"lezajsk.pl":true,"limanowa.pl":true,"lomza.pl":true,"lowicz.pl":true,"lubin.pl":true,"lukow.pl":true,"malbork.pl":true,"malopolska.pl":true,"mazowsze.pl":true,"mazury.pl":true,"mielec.pl":true,"mielno.pl":true,"mragowo.pl":true,"naklo.pl":true,"nowaruda.pl":true,"nysa.pl":true,"olawa.pl":true,"olecko.pl":true,"olkusz.pl":true,"olsztyn.pl":true,"opoczno.pl":true,"opole.pl":true,"ostroda.pl":true,"ostroleka.pl":true,"ostrowiec.pl":true,"ostrowwlkp.pl":true,"pila.pl":true,"pisz.pl":true,"podhale.pl":true,"podlasie.pl":true,"polkowice.pl":true,"pomorze.pl":true,"pomorskie.pl":true,"prochowice.pl":true,"pruszkow.pl":true,"przeworsk.pl":true,"pulawy.pl":true,"radom.pl":true,"rawa-maz.pl":true,"rybnik.pl":true,"rzeszow.pl":true,"sanok.pl":true,"sejny.pl":true,"slask.pl":true,"slupsk.pl":true,"sosnowiec.pl":true,"stalowa-wola.pl":true,"skoczow.pl":true,"starachowice.pl":true,"stargard.pl":true,"suwalki.pl":true,"swidnica.pl":true,"swiebodzin.pl":true,"swinoujscie.pl":true,"szczecin.pl":true,"szczytno.pl":true,"tarnobrzeg.pl":true,"tgory.pl":true,"turek.pl":true,"tychy.pl":true,"ustka.pl":true,"walbrzych.pl":true,"warmia.pl":true,"warszawa.pl":true,"wegrow.pl":true,"wielun.pl":true,"wlocl.pl":true,"wloclawek.pl":true,"wodzislaw.pl":true,"wolomin.pl":true,"wroclaw.pl":true,"zachpomor.pl":true,"zagan.pl":true,"zarow.pl":true,"zgora.pl":true,"zgorzelec.pl":true,"pm":true,"pn":true,"gov.pn":true,"co.pn":true,"org.pn":true,"edu.pn":true,"net.pn":true,"post":true,"pr":true,"com.pr":true,"net.pr":true,"org.pr":true,"gov.pr":true,"edu.pr":true,"isla.pr":true,"pro.pr":true,"biz.pr":true,"info.pr":true,"name.pr":true,"est.pr":true,"prof.pr":true,"ac.pr":true,"pro":true,"aca.pro":true,"bar.pro":true,"cpa.pro":true,"jur.pro":true,"law.pro":true,"med.pro":true,"eng.pro":true,"ps":true,"edu.ps":true,"gov.ps":true,"sec.ps":true,"plo.ps":true,"com.ps":true,"org.ps":true,"net.ps":true,"pt":true,"net.pt":true,"gov.pt":true,"org.pt":true,"edu.pt":true,"int.pt":true,"publ.pt":true,"com.pt":true,"nome.pt":true,"pw":true,"co.pw":true,"ne.pw":true,"or.pw":true,"ed.pw":true,"go.pw":true,"belau.pw":true,"py":true,"com.py":true,"coop.py":true,"edu.py":true,"gov.py":true,"mil.py":true,"net.py":true,"org.py":true,"qa":true,"com.qa":true,"edu.qa":true,"gov.qa":true,"mil.qa":true,"name.qa":true,"net.qa":true,"org.qa":true,"sch.qa":true,"re":true,"com.re":true,"asso.re":true,"nom.re":true,"ro":true,"com.ro":true,"org.ro":true,"tm.ro":true,"nt.ro":true,"nom.ro":true,"info.ro":true,"rec.ro":true,"arts.ro":true,"firm.ro":true,"store.ro":true,"www.ro":true,"rs":true,"co.rs":true,"org.rs":true,"edu.rs":true,"ac.rs":true,"gov.rs":true,"in.rs":true,"ru":true,"ac.ru":true,"com.ru":true,"edu.ru":true,"int.ru":true,"net.ru":true,"org.ru":true,"pp.ru":true,"adygeya.ru":true,"altai.ru":true,"amur.ru":true,"arkhangelsk.ru":true,"astrakhan.ru":true,"bashkiria.ru":true,"belgorod.ru":true,"bir.ru":true,"bryansk.ru":true,"buryatia.ru":true,"cbg.ru":true,"chel.ru":true,"chelyabinsk.ru":true,"chita.ru":true,"chukotka.ru":true,"chuvashia.ru":true,"dagestan.ru":true,"dudinka.ru":true,"e-burg.ru":true,"grozny.ru":true,"irkutsk.ru":true,"ivanovo.ru":true,"izhevsk.ru":true,"jar.ru":true,"joshkar-ola.ru":true,"kalmykia.ru":true,"kaluga.ru":true,"kamchatka.ru":true,"karelia.ru":true,"kazan.ru":true,"kchr.ru":true,"kemerovo.ru":true,"khabarovsk.ru":true,"khakassia.ru":true,"khv.ru":true,"kirov.ru":true,"koenig.ru":true,"komi.ru":true,"kostroma.ru":true,"krasnoyarsk.ru":true,"kuban.ru":true,"kurgan.ru":true,"kursk.ru":true,"lipetsk.ru":true,"magadan.ru":true,"mari.ru":true,"mari-el.ru":true,"marine.ru":true,"mordovia.ru":true,"msk.ru":true,"murmansk.ru":true,"nalchik.ru":true,"nnov.ru":true,"nov.ru":true,"novosibirsk.ru":true,"nsk.ru":true,"omsk.ru":true,"orenburg.ru":true,"oryol.ru":true,"palana.ru":true,"penza.ru":true,"perm.ru":true,"ptz.ru":true,"rnd.ru":true,"ryazan.ru":true,"sakhalin.ru":true,"samara.ru":true,"saratov.ru":true,"simbirsk.ru":true,"smolensk.ru":true,"spb.ru":true,"stavropol.ru":true,"stv.ru":true,"surgut.ru":true,"tambov.ru":true,"tatarstan.ru":true,"tom.ru":true,"tomsk.ru":true,"tsaritsyn.ru":true,"tsk.ru":true,"tula.ru":true,"tuva.ru":true,"tver.ru":true,"tyumen.ru":true,"udm.ru":true,"udmurtia.ru":true,"ulan-ude.ru":true,"vladikavkaz.ru":true,"vladimir.ru":true,"vladivostok.ru":true,"volgograd.ru":true,"vologda.ru":true,"voronezh.ru":true,"vrn.ru":true,"vyatka.ru":true,"yakutia.ru":true,"yamal.ru":true,"yaroslavl.ru":true,"yekaterinburg.ru":true,"yuzhno-sakhalinsk.ru":true,"amursk.ru":true,"baikal.ru":true,"cmw.ru":true,"fareast.ru":true,"jamal.ru":true,"kms.ru":true,"k-uralsk.ru":true,"kustanai.ru":true,"kuzbass.ru":true,"magnitka.ru":true,"mytis.ru":true,"nakhodka.ru":true,"nkz.ru":true,"norilsk.ru":true,"oskol.ru":true,"pyatigorsk.ru":true,"rubtsovsk.ru":true,"snz.ru":true,"syzran.ru":true,"vdonsk.ru":true,"zgrad.ru":true,"gov.ru":true,"mil.ru":true,"test.ru":true,"rw":true,"gov.rw":true,"net.rw":true,"edu.rw":true,"ac.rw":true,"com.rw":true,"co.rw":true,"int.rw":true,"mil.rw":true,"gouv.rw":true,"sa":true,"com.sa":true,"net.sa":true,"org.sa":true,"gov.sa":true,"med.sa":true,"pub.sa":true,"edu.sa":true,"sch.sa":true,"sb":true,"com.sb":true,"edu.sb":true,"gov.sb":true,"net.sb":true,"org.sb":true,"sc":true,"com.sc":true,"gov.sc":true,"net.sc":true,"org.sc":true,"edu.sc":true,"sd":true,"com.sd":true,"net.sd":true,"org.sd":true,"edu.sd":true,"med.sd":true,"tv.sd":true,"gov.sd":true,"info.sd":true,"se":true,"a.se":true,"ac.se":true,"b.se":true,"bd.se":true,"brand.se":true,"c.se":true,"d.se":true,"e.se":true,"f.se":true,"fh.se":true,"fhsk.se":true,"fhv.se":true,"g.se":true,"h.se":true,"i.se":true,"k.se":true,"komforb.se":true,"kommunalforbund.se":true,"komvux.se":true,"l.se":true,"lanbib.se":true,"m.se":true,"n.se":true,"naturbruksgymn.se":true,"o.se":true,"org.se":true,"p.se":true,"parti.se":true,"pp.se":true,"press.se":true,"r.se":true,"s.se":true,"t.se":true,"tm.se":true,"u.se":true,"w.se":true,"x.se":true,"y.se":true,"z.se":true,"sg":true,"com.sg":true,"net.sg":true,"org.sg":true,"gov.sg":true,"edu.sg":true,"per.sg":true,"sh":true,"com.sh":true,"net.sh":true,"gov.sh":true,"org.sh":true,"mil.sh":true,"si":true,"sj":true,"sk":true,"sl":true,"com.sl":true,"net.sl":true,"edu.sl":true,"gov.sl":true,"org.sl":true,"sm":true,"sn":true,"art.sn":true,"com.sn":true,"edu.sn":true,"gouv.sn":true,"org.sn":true,"perso.sn":true,"univ.sn":true,"so":true,"com.so":true,"net.so":true,"org.so":true,"sr":true,"st":true,"co.st":true,"com.st":true,"consulado.st":true,"edu.st":true,"embaixada.st":true,"gov.st":true,"mil.st":true,"net.st":true,"org.st":true,"principe.st":true,"saotome.st":true,"store.st":true,"su":true,"adygeya.su":true,"arkhangelsk.su":true,"balashov.su":true,"bashkiria.su":true,"bryansk.su":true,"dagestan.su":true,"grozny.su":true,"ivanovo.su":true,"kalmykia.su":true,"kaluga.su":true,"karelia.su":true,"khakassia.su":true,"krasnodar.su":true,"kurgan.su":true,"lenug.su":true,"mordovia.su":true,"msk.su":true,"murmansk.su":true,"nalchik.su":true,"nov.su":true,"obninsk.su":true,"penza.su":true,"pokrovsk.su":true,"sochi.su":true,"spb.su":true,"togliatti.su":true,"troitsk.su":true,"tula.su":true,"tuva.su":true,"vladikavkaz.su":true,"vladimir.su":true,"vologda.su":true,"sv":true,"com.sv":true,"edu.sv":true,"gob.sv":true,"org.sv":true,"red.sv":true,"sx":true,"gov.sx":true,"sy":true,"edu.sy":true,"gov.sy":true,"net.sy":true,"mil.sy":true,"com.sy":true,"org.sy":true,"sz":true,"co.sz":true,"ac.sz":true,"org.sz":true,"tc":true,"td":true,"tel":true,"tf":true,"tg":true,"th":true,"ac.th":true,"co.th":true,"go.th":true,"in.th":true,"mi.th":true,"net.th":true,"or.th":true,"tj":true,"ac.tj":true,"biz.tj":true,"co.tj":true,"com.tj":true,"edu.tj":true,"go.tj":true,"gov.tj":true,"int.tj":true,"mil.tj":true,"name.tj":true,"net.tj":true,"nic.tj":true,"org.tj":true,"test.tj":true,"web.tj":true,"tk":true,"tl":true,"gov.tl":true,"tm":true,"com.tm":true,"co.tm":true,"org.tm":true,"net.tm":true,"nom.tm":true,"gov.tm":true,"mil.tm":true,"edu.tm":true,"tn":true,"com.tn":true,"ens.tn":true,"fin.tn":true,"gov.tn":true,"ind.tn":true,"intl.tn":true,"nat.tn":true,"net.tn":true,"org.tn":true,"info.tn":true,"perso.tn":true,"tourism.tn":true,"edunet.tn":true,"rnrt.tn":true,"rns.tn":true,"rnu.tn":true,"mincom.tn":true,"agrinet.tn":true,"defense.tn":true,"turen.tn":true,"to":true,"com.to":true,"gov.to":true,"net.to":true,"org.to":true,"edu.to":true,"mil.to":true,"tp":true,"tr":true,"com.tr":true,"info.tr":true,"biz.tr":true,"net.tr":true,"org.tr":true,"web.tr":true,"gen.tr":true,"tv.tr":true,"av.tr":true,"dr.tr":true,"bbs.tr":true,"name.tr":true,"tel.tr":true,"gov.tr":true,"bel.tr":true,"pol.tr":true,"mil.tr":true,"k12.tr":true,"edu.tr":true,"kep.tr":true,"nc.tr":true,"gov.nc.tr":true,"travel":true,"tt":true,"co.tt":true,"com.tt":true,"org.tt":true,"net.tt":true,"biz.tt":true,"info.tt":true,"pro.tt":true,"int.tt":true,"coop.tt":true,"jobs.tt":true,"mobi.tt":true,"travel.tt":true,"museum.tt":true,"aero.tt":true,"name.tt":true,"gov.tt":true,"edu.tt":true,"tv":true,"tw":true,"edu.tw":true,"gov.tw":true,"mil.tw":true,"com.tw":true,"net.tw":true,"org.tw":true,"idv.tw":true,"game.tw":true,"ebiz.tw":true,"club.tw":true,"xn--zf0ao64a.tw":true,"xn--uc0atv.tw":true,"xn--czrw28b.tw":true,"tz":true,"ac.tz":true,"co.tz":true,"go.tz":true,"hotel.tz":true,"info.tz":true,"me.tz":true,"mil.tz":true,"mobi.tz":true,"ne.tz":true,"or.tz":true,"sc.tz":true,"tv.tz":true,"ua":true,"com.ua":true,"edu.ua":true,"gov.ua":true,"in.ua":true,"net.ua":true,"org.ua":true,"cherkassy.ua":true,"cherkasy.ua":true,"chernigov.ua":true,"chernihiv.ua":true,"chernivtsi.ua":true,"chernovtsy.ua":true,"ck.ua":true,"cn.ua":true,"cr.ua":true,"crimea.ua":true,"cv.ua":true,"dn.ua":true,"dnepropetrovsk.ua":true,"dnipropetrovsk.ua":true,"dominic.ua":true,"donetsk.ua":true,"dp.ua":true,"if.ua":true,"ivano-frankivsk.ua":true,"kh.ua":true,"kharkiv.ua":true,"kharkov.ua":true,"kherson.ua":true,"khmelnitskiy.ua":true,"khmelnytskyi.ua":true,"kiev.ua":true,"kirovograd.ua":true,"km.ua":true,"kr.ua":true,"krym.ua":true,"ks.ua":true,"kv.ua":true,"kyiv.ua":true,"lg.ua":true,"lt.ua":true,"lugansk.ua":true,"lutsk.ua":true,"lv.ua":true,"lviv.ua":true,"mk.ua":true,"mykolaiv.ua":true,"nikolaev.ua":true,"od.ua":true,"odesa.ua":true,"odessa.ua":true,"pl.ua":true,"poltava.ua":true,"rivne.ua":true,"rovno.ua":true,"rv.ua":true,"sb.ua":true,"sebastopol.ua":true,"sevastopol.ua":true,"sm.ua":true,"sumy.ua":true,"te.ua":true,"ternopil.ua":true,"uz.ua":true,"uzhgorod.ua":true,"vinnica.ua":true,"vinnytsia.ua":true,"vn.ua":true,"volyn.ua":true,"yalta.ua":true,"zaporizhzhe.ua":true,"zaporizhzhia.ua":true,"zhitomir.ua":true,"zhytomyr.ua":true,"zp.ua":true,"zt.ua":true,"co.ua":true,"pp.ua":true,"ug":true,"co.ug":true,"or.ug":true,"ac.ug":true,"sc.ug":true,"go.ug":true,"ne.ug":true,"com.ug":true,"org.ug":true,"uk":true,"ac.uk":true,"co.uk":true,"gov.uk":true,"ltd.uk":true,"me.uk":true,"net.uk":true,"nhs.uk":true,"org.uk":true,"plc.uk":true,"police.uk":true,"*.sch.uk":true,"us":true,"dni.us":true,"fed.us":true,"isa.us":true,"kids.us":true,"nsn.us":true,"ak.us":true,"al.us":true,"ar.us":true,"as.us":true,"az.us":true,"ca.us":true,"co.us":true,"ct.us":true,"dc.us":true,"de.us":true,"fl.us":true,"ga.us":true,"gu.us":true,"hi.us":true,"ia.us":true,"id.us":true,"il.us":true,"in.us":true,"ks.us":true,"ky.us":true,"la.us":true,"ma.us":true,"md.us":true,"me.us":true,"mi.us":true,"mn.us":true,"mo.us":true,"ms.us":true,"mt.us":true,"nc.us":true,"nd.us":true,"ne.us":true,"nh.us":true,"nj.us":true,"nm.us":true,"nv.us":true,"ny.us":true,"oh.us":true,"ok.us":true,"or.us":true,"pa.us":true,"pr.us":true,"ri.us":true,"sc.us":true,"sd.us":true,"tn.us":true,"tx.us":true,"ut.us":true,"vi.us":true,"vt.us":true,"va.us":true,"wa.us":true,"wi.us":true,"wv.us":true,"wy.us":true,"k12.ak.us":true,"k12.al.us":true,"k12.ar.us":true,"k12.as.us":true,"k12.az.us":true,"k12.ca.us":true,"k12.co.us":true,"k12.ct.us":true,"k12.dc.us":true,"k12.de.us":true,"k12.fl.us":true,"k12.ga.us":true,"k12.gu.us":true,"k12.ia.us":true,"k12.id.us":true,"k12.il.us":true,"k12.in.us":true,"k12.ks.us":true,"k12.ky.us":true,"k12.la.us":true,"k12.ma.us":true,"k12.md.us":true,"k12.me.us":true,"k12.mi.us":true,"k12.mn.us":true,"k12.mo.us":true,"k12.ms.us":true,"k12.mt.us":true,"k12.nc.us":true,"k12.ne.us":true,"k12.nh.us":true,"k12.nj.us":true,"k12.nm.us":true,"k12.nv.us":true,"k12.ny.us":true,"k12.oh.us":true,"k12.ok.us":true,"k12.or.us":true,"k12.pa.us":true,"k12.pr.us":true,"k12.ri.us":true,"k12.sc.us":true,"k12.tn.us":true,"k12.tx.us":true,"k12.ut.us":true,"k12.vi.us":true,"k12.vt.us":true,"k12.va.us":true,"k12.wa.us":true,"k12.wi.us":true,"k12.wy.us":true,"cc.ak.us":true,"cc.al.us":true,"cc.ar.us":true,"cc.as.us":true,"cc.az.us":true,"cc.ca.us":true,"cc.co.us":true,"cc.ct.us":true,"cc.dc.us":true,"cc.de.us":true,"cc.fl.us":true,"cc.ga.us":true,"cc.gu.us":true,"cc.hi.us":true,"cc.ia.us":true,"cc.id.us":true,"cc.il.us":true,"cc.in.us":true,"cc.ks.us":true,"cc.ky.us":true,"cc.la.us":true,"cc.ma.us":true,"cc.md.us":true,"cc.me.us":true,"cc.mi.us":true,"cc.mn.us":true,"cc.mo.us":true,"cc.ms.us":true,"cc.mt.us":true,"cc.nc.us":true,"cc.nd.us":true,"cc.ne.us":true,"cc.nh.us":true,"cc.nj.us":true,"cc.nm.us":true,"cc.nv.us":true,"cc.ny.us":true,"cc.oh.us":true,"cc.ok.us":true,"cc.or.us":true,"cc.pa.us":true,"cc.pr.us":true,"cc.ri.us":true,"cc.sc.us":true,"cc.sd.us":true,"cc.tn.us":true,"cc.tx.us":true,"cc.ut.us":true,"cc.vi.us":true,"cc.vt.us":true,"cc.va.us":true,"cc.wa.us":true,"cc.wi.us":true,"cc.wv.us":true,"cc.wy.us":true,"lib.ak.us":true,"lib.al.us":true,"lib.ar.us":true,"lib.as.us":true,"lib.az.us":true,"lib.ca.us":true,"lib.co.us":true,"lib.ct.us":true,"lib.dc.us":true,"lib.de.us":true,"lib.fl.us":true,"lib.ga.us":true,"lib.gu.us":true,"lib.hi.us":true,"lib.ia.us":true,"lib.id.us":true,"lib.il.us":true,"lib.in.us":true,"lib.ks.us":true,"lib.ky.us":true,"lib.la.us":true,"lib.ma.us":true,"lib.md.us":true,"lib.me.us":true,"lib.mi.us":true,"lib.mn.us":true,"lib.mo.us":true,"lib.ms.us":true,"lib.mt.us":true,"lib.nc.us":true,"lib.nd.us":true,"lib.ne.us":true,"lib.nh.us":true,"lib.nj.us":true,"lib.nm.us":true,"lib.nv.us":true,"lib.ny.us":true,"lib.oh.us":true,"lib.ok.us":true,"lib.or.us":true,"lib.pa.us":true,"lib.pr.us":true,"lib.ri.us":true,"lib.sc.us":true,"lib.sd.us":true,"lib.tn.us":true,"lib.tx.us":true,"lib.ut.us":true,"lib.vi.us":true,"lib.vt.us":true,"lib.va.us":true,"lib.wa.us":true,"lib.wi.us":true,"lib.wy.us":true,"pvt.k12.ma.us":true,"chtr.k12.ma.us":true,"paroch.k12.ma.us":true,"uy":true,"com.uy":true,"edu.uy":true,"gub.uy":true,"mil.uy":true,"net.uy":true,"org.uy":true,"uz":true,"co.uz":true,"com.uz":true,"net.uz":true,"org.uz":true,"va":true,"vc":true,"com.vc":true,"net.vc":true,"org.vc":true,"gov.vc":true,"mil.vc":true,"edu.vc":true,"ve":true,"arts.ve":true,"co.ve":true,"com.ve":true,"e12.ve":true,"edu.ve":true,"firm.ve":true,"gob.ve":true,"gov.ve":true,"info.ve":true,"int.ve":true,"mil.ve":true,"net.ve":true,"org.ve":true,"rec.ve":true,"store.ve":true,"tec.ve":true,"web.ve":true,"vg":true,"vi":true,"co.vi":true,"com.vi":true,"k12.vi":true,"net.vi":true,"org.vi":true,"vn":true,"com.vn":true,"net.vn":true,"org.vn":true,"edu.vn":true,"gov.vn":true,"int.vn":true,"ac.vn":true,"biz.vn":true,"info.vn":true,"name.vn":true,"pro.vn":true,"health.vn":true,"vu":true,"com.vu":true,"edu.vu":true,"net.vu":true,"org.vu":true,"wf":true,"ws":true,"com.ws":true,"net.ws":true,"org.ws":true,"gov.ws":true,"edu.ws":true,"yt":true,"xn--mgbaam7a8h":true,"xn--54b7fta0cc":true,"xn--fiqs8s":true,"xn--fiqz9s":true,"xn--lgbbat1ad8j":true,"xn--wgbh1c":true,"xn--node":true,"xn--j6w193g":true,"xn--h2brj9c":true,"xn--mgbbh1a71e":true,"xn--fpcrj9c3d":true,"xn--gecrj9c":true,"xn--s9brj9c":true,"xn--45brj9c":true,"xn--xkc2dl3a5ee0h":true,"xn--mgba3a4f16a":true,"xn--mgba3a4fra":true,"xn--mgbayh7gpa":true,"xn--3e0b707e":true,"xn--80ao21a":true,"xn--fzc2c9e2c":true,"xn--xkc2al3hye2a":true,"xn--mgbc0a9azcg":true,"xn--l1acc":true,"xn--mgbx4cd0ab":true,"xn--mgb9awbf":true,"xn--ygbi2ammx":true,"xn--90a3ac":true,"xn--o1ac.xn--90a3ac":true,"xn--c1avg.xn--90a3ac":true,"xn--90azh.xn--90a3ac":true,"xn--d1at.xn--90a3ac":true,"xn--o1ach.xn--90a3ac":true,"xn--80au.xn--90a3ac":true,"xn--p1ai":true,"xn--wgbl6a":true,"xn--mgberp4a5d4ar":true,"xn--mgberp4a5d4a87g":true,"xn--mgbqly7c0a67fbc":true,"xn--mgbqly7cvafr":true,"xn--ogbpf8fl":true,"xn--mgbtf8fl":true,"xn--yfro4i67o":true,"xn--clchc0ea0b2g2a9gcd":true,"xn--o3cw4h":true,"xn--pgbs0dh":true,"xn--kpry57d":true,"xn--kprw13d":true,"xn--nnx388a":true,"xn--j1amh":true,"xn--mgb2ddes":true,"xxx":true,"*.ye":true,"*.za":true,"*.zm":true,"*.zw":true,"aaa":true,"abb":true,"abbott":true,"abogado":true,"academy":true,"accenture":true,"accountant":true,"accountants":true,"aco":true,"active":true,"actor":true,"ads":true,"adult":true,"aeg":true,"afl":true,"africa":true,"africamagic":true,"agency":true,"aig":true,"airforce":true,"airtel":true,"alibaba":true,"alipay":true,"allfinanz":true,"alsace":true,"amsterdam":true,"analytics":true,"android":true,"anquan":true,"apartments":true,"aquarelle":true,"aramco":true,"archi":true,"army":true,"arte":true,"associates":true,"attorney":true,"auction":true,"audio":true,"author":true,"auto":true,"autos":true,"avianca":true,"axa":true,"azure":true,"baidu":true,"band":true,"bank":true,"bar":true,"barcelona":true,"barclaycard":true,"barclays":true,"bargains":true,"bauhaus":true,"bayern":true,"bbc":true,"bbva":true,"bcg":true,"bcn":true,"beer":true,"bentley":true,"berlin":true,"best":true,"bharti":true,"bible":true,"bid":true,"bike":true,"bing":true,"bingo":true,"bio":true,"black":true,"blackfriday":true,"bloomberg":true,"blue":true,"bms":true,"bmw":true,"bnl":true,"bnpparibas":true,"boats":true,"bom":true,"bond":true,"boo":true,"boots":true,"bot":true,"boutique":true,"bradesco":true,"bridgestone":true,"broadway":true,"broker":true,"brother":true,"brussels":true,"budapest":true,"build":true,"builders":true,"business":true,"buy":true,"buzz":true,"bzh":true,"cab":true,"cafe":true,"cal":true,"call":true,"camera":true,"camp":true,"cancerresearch":true,"canon":true,"capetown":true,"capital":true,"car":true,"caravan":true,"cards":true,"care":true,"career":true,"careers":true,"cars":true,"cartier":true,"casa":true,"cash":true,"casino":true,"catering":true,"cba":true,"cbn":true,"center":true,"ceo":true,"cern":true,"cfa":true,"cfd":true,"channel":true,"chat":true,"cheap":true,"chloe":true,"christmas":true,"chrome":true,"church":true,"cipriani":true,"circle":true,"cisco":true,"citic":true,"city":true,"cityeats":true,"claims":true,"cleaning":true,"click":true,"clinic":true,"clothing":true,"club":true,"coach":true,"codes":true,"coffee":true,"college":true,"cologne":true,"commbank":true,"community":true,"company":true,"computer":true,"comsec":true,"condos":true,"construction":true,"consulting":true,"contact":true,"contractors":true,"cooking":true,"cool":true,"corsica":true,"country":true,"coupon":true,"coupons":true,"courses":true,"credit":true,"creditcard":true,"creditunion":true,"cricket":true,"crown":true,"crs":true,"cruises":true,"csc":true,"cuisinella":true,"cymru":true,"cyou":true,"dabur":true,"dad":true,"dance":true,"date":true,"dating":true,"datsun":true,"day":true,"dclk":true,"dealer":true,"deals":true,"degree":true,"delivery":true,"dell":true,"delta":true,"democrat":true,"dental":true,"dentist":true,"desi":true,"design":true,"dev":true,"diamonds":true,"diet":true,"digital":true,"direct":true,"directory":true,"discount":true,"dnp":true,"docs":true,"dog":true,"doha":true,"domains":true,"doosan":true,"download":true,"drive":true,"dstv":true,"dubai":true,"durban":true,"dvag":true,"earth":true,"eat":true,"edeka":true,"education":true,"email":true,"emerck":true,"energy":true,"engineer":true,"engineering":true,"enterprises":true,"epson":true,"equipment":true,"erni":true,"esq":true,"estate":true,"eurovision":true,"eus":true,"events":true,"everbank":true,"exchange":true,"expert":true,"exposed":true,"express":true,"fage":true,"fail":true,"fairwinds":true,"faith":true,"family":true,"fan":true,"fans":true,"farm":true,"fashion":true,"fast":true,"feedback":true,"ferrero":true,"film":true,"final":true,"finance":true,"financial":true,"firestone":true,"firmdale":true,"fish":true,"fishing":true,"fit":true,"fitness":true,"flickr":true,"flights":true,"florist":true,"flowers":true,"flsmidth":true,"fly":true,"foo":true,"football":true,"ford":true,"forex":true,"forsale":true,"forum":true,"foundation":true,"frl":true,"frogans":true,"frontier":true,"fund":true,"furniture":true,"futbol":true,"fyi":true,"gal":true,"gallery":true,"gallup":true,"garden":true,"gbiz":true,"gdn":true,"gea":true,"gent":true,"genting":true,"ggee":true,"gift":true,"gifts":true,"gives":true,"giving":true,"glass":true,"gle":true,"global":true,"globo":true,"gmail":true,"gmo":true,"gmx":true,"gold":true,"goldpoint":true,"golf":true,"goo":true,"goog":true,"google":true,"gop":true,"got":true,"gotv":true,"graphics":true,"gratis":true,"green":true,"gripe":true,"group":true,"gucci":true,"guge":true,"guide":true,"guitars":true,"guru":true,"hamburg":true,"hangout":true,"haus":true,"hdfcbank":true,"health":true,"healthcare":true,"help":true,"helsinki":true,"here":true,"hermes":true,"hiphop":true,"hitachi":true,"hiv":true,"hockey":true,"holdings":true,"holiday":true,"homedepot":true,"homes":true,"honda":true,"horse":true,"host":true,"hosting":true,"hoteles":true,"hotmail":true,"house":true,"how":true,"hsbc":true,"htc":true,"ibm":true,"icbc":true,"ice":true,"icu":true,"ifm":true,"iinet":true,"immo":true,"immobilien":true,"industries":true,"infiniti":true,"ing":true,"ink":true,"institute":true,"insurance":true,"insure":true,"international":true,"investments":true,"ipiranga":true,"irish":true,"iselect":true,"ist":true,"istanbul":true,"itau":true,"iwc":true,"jaguar":true,"java":true,"jcb":true,"jetzt":true,"jewelry":true,"jio":true,"jlc":true,"jll":true,"jmp":true,"joburg":true,"jot":true,"joy":true,"jprs":true,"juegos":true,"kaufen":true,"kddi":true,"kfh":true,"kim":true,"kinder":true,"kitchen":true,"kiwi":true,"koeln":true,"komatsu":true,"kpn":true,"krd":true,"kred":true,"kyknet":true,"kyoto":true,"lacaixa":true,"lancaster":true,"land":true,"landrover":true,"lasalle":true,"lat":true,"latrobe":true,"law":true,"lawyer":true,"lds":true,"lease":true,"leclerc":true,"legal":true,"lgbt":true,"liaison":true,"lidl":true,"life":true,"lifeinsurance":true,"lifestyle":true,"lighting":true,"like":true,"limited":true,"limo":true,"lincoln":true,"linde":true,"link":true,"live":true,"lixil":true,"loan":true,"loans":true,"lol":true,"london":true,"lotte":true,"lotto":true,"love":true,"ltd":true,"ltda":true,"lupin":true,"luxe":true,"luxury":true,"madrid":true,"maif":true,"maison":true,"makeup":true,"man":true,"management":true,"mango":true,"market":true,"marketing":true,"markets":true,"marriott":true,"mba":true,"media":true,"meet":true,"melbourne":true,"meme":true,"memorial":true,"men":true,"menu":true,"meo":true,"miami":true,"microsoft":true,"mini":true,"mma":true,"mnet":true,"mobily":true,"moda":true,"moe":true,"moi":true,"monash":true,"money":true,"montblanc":true,"mormon":true,"mortgage":true,"moscow":true,"motorcycles":true,"mov":true,"movie":true,"movistar":true,"mtn":true,"mtpc":true,"mtr":true,"multichoice":true,"mutual":true,"mzansimagic":true,"nadex":true,"nagoya":true,"naspers":true,"natura":true,"navy":true,"nec":true,"netbank":true,"network":true,"neustar":true,"new":true,"news":true,"nexus":true,"ngo":true,"nhk":true,"nico":true,"ninja":true,"nissan":true,"nokia":true,"norton":true,"nowruz":true,"nra":true,"nrw":true,"ntt":true,"nyc":true,"obi":true,"office":true,"okinawa":true,"omega":true,"one":true,"ong":true,"onl":true,"online":true,"ooo":true,"oracle":true,"orange":true,"organic":true,"orientexpress":true,"osaka":true,"otsuka":true,"ovh":true,"page":true,"pamperedchef":true,"panerai":true,"paris":true,"pars":true,"partners":true,"parts":true,"party":true,"passagens":true,"payu":true,"pharmacy":true,"philips":true,"photo":true,"photography":true,"photos":true,"physio":true,"piaget":true,"pics":true,"pictet":true,"pictures":true,"pid":true,"pin":true,"pink":true,"pizza":true,"place":true,"play":true,"plumbing":true,"plus":true,"pohl":true,"poker":true,"porn":true,"praxi":true,"press":true,"prod":true,"productions":true,"prof":true,"promo":true,"properties":true,"property":true,"pub":true,"qpon":true,"quebec":true,"quest":true,"racing":true,"read":true,"realtor":true,"realty":true,"recipes":true,"red":true,"redstone":true,"redumbrella":true,"rehab":true,"reise":true,"reisen":true,"reit":true,"reliance":true,"ren":true,"rent":true,"rentals":true,"repair":true,"report":true,"republican":true,"rest":true,"restaurant":true,"review":true,"reviews":true,"rich":true,"ricoh":true,"ril":true,"rio":true,"rip":true,"rocher":true,"rocks":true,"rodeo":true,"room":true,"rsvp":true,"ruhr":true,"run":true,"rwe":true,"ryukyu":true,"saarland":true,"safe":true,"safety":true,"sakura":true,"sale":true,"salon":true,"samsung":true,"sandvik":true,"sandvikcoromant":true,"sanofi":true,"sap":true,"sapo":true,"sarl":true,"sas":true,"saxo":true,"sbi":true,"sbs":true,"sca":true,"scb":true,"schmidt":true,"scholarships":true,"school":true,"schule":true,"schwarz":true,"science":true,"scor":true,"scot":true,"seat":true,"seek":true,"sener":true,"services":true,"sew":true,"sex":true,"sexy":true,"sharp":true,"shia":true,"shiksha":true,"shoes":true,"shouji":true,"show":true,"shriram":true,"sina":true,"singles":true,"site":true,"skin":true,"sky":true,"skype":true,"smile":true,"sncf":true,"soccer":true,"social":true,"software":true,"sohu":true,"solar":true,"solutions":true,"song":true,"sony":true,"soy":true,"space":true,"spiegel":true,"spot":true,"spreadbetting":true,"stada":true,"star":true,"starhub":true,"statebank":true,"statoil":true,"stc":true,"stcgroup":true,"stockholm":true,"storage":true,"studio":true,"study":true,"style":true,"sucks":true,"supersport":true,"supplies":true,"supply":true,"support":true,"surf":true,"surgery":true,"suzuki":true,"swatch":true,"swiss":true,"sydney":true,"symantec":true,"systems":true,"tab":true,"taipei":true,"taobao":true,"tatamotors":true,"tatar":true,"tattoo":true,"tax":true,"taxi":true,"tci":true,"team":true,"tech":true,"technology":true,"telecity":true,"telefonica":true,"temasek":true,"tennis":true,"thd":true,"theater":true,"tickets":true,"tienda":true,"tiffany":true,"tips":true,"tires":true,"tirol":true,"tmall":true,"today":true,"tokyo":true,"tools":true,"top":true,"toray":true,"toshiba":true,"tours":true,"town":true,"toys":true,"trade":true,"trading":true,"training":true,"travelers":true,"travelersinsurance":true,"trust":true,"trv":true,"tui":true,"tunes":true,"tushu":true,"tvs":true,"ubs":true,"university":true,"uno":true,"uol":true,"vacations":true,"vana":true,"vegas":true,"ventures":true,"versicherung":true,"vet":true,"viajes":true,"video":true,"viking":true,"villas":true,"vip":true,"virgin":true,"vision":true,"vista":true,"vistaprint":true,"viva":true,"vlaanderen":true,"vodka":true,"vote":true,"voting":true,"voto":true,"voyage":true,"vuelos":true,"wales":true,"walter":true,"wang":true,"wanggou":true,"watch":true,"watches":true,"weather":true,"weatherchannel":true,"webcam":true,"website":true,"wed":true,"wedding":true,"weibo":true,"weir":true,"whoswho":true,"wien":true,"wiki":true,"williamhill":true,"win":true,"windows":true,"wme":true,"work":true,"works":true,"world":true,"wtc":true,"wtf":true,"xbox":true,"xerox":true,"xihuan":true,"xin":true,"xn--11b4c3d":true,"xn--1ck2e1b":true,"xn--1qqw23a":true,"xn--30rr7y":true,"xn--3bst00m":true,"xn--3ds443g":true,"xn--3pxu8k":true,"xn--42c2d9a":true,"xn--45q11c":true,"xn--4gbrim":true,"xn--55qw42g":true,"xn--55qx5d":true,"xn--5tzm5g":true,"xn--6frz82g":true,"xn--6qq986b3xl":true,"xn--80adxhks":true,"xn--80asehdb":true,"xn--80aswg":true,"xn--8y0a063a":true,"xn--9dbq2a":true,"xn--9et52u":true,"xn--9krt00a":true,"xn--b4w605ferd":true,"xn--bck1b9a5dre4c":true,"xn--c1avg":true,"xn--c2br7g":true,"xn--cck2b3b":true,"xn--cg4bki":true,"xn--czr694b":true,"xn--czrs0t":true,"xn--czru2d":true,"xn--d1acj3b":true,"xn--eckvdtc9d":true,"xn--efvy88h":true,"xn--estv75g":true,"xn--fhbei":true,"xn--fiq228c5hs":true,"xn--fiq64b":true,"xn--fjq720a":true,"xn--flw351e":true,"xn--g2xx48c":true,"xn--gckr3f0f":true,"xn--hxt814e":true,"xn--i1b6b1a6a2e":true,"xn--imr513n":true,"xn--io0a7i":true,"xn--j1aef":true,"xn--jlq61u9w7b":true,"xn--jvr189m":true,"xn--kcrx77d1x4a":true,"xn--kpu716f":true,"xn--kput3i":true,"xn--mgba3a3ejt":true,"xn--mgbab2bd":true,"xn--mgbb9fbpob":true,"xn--mgbt3dhd":true,"xn--mk1bu44c":true,"xn--mxtq1m":true,"xn--ngbc5azd":true,"xn--ngbe9e0a":true,"xn--nqv7f":true,"xn--nqv7fs00ema":true,"xn--nyqy26a":true,"xn--p1acf":true,"xn--pbt977c":true,"xn--pssy2u":true,"xn--q9jyb4c":true,"xn--qcka1pmc":true,"xn--rhqv96g":true,"xn--rovu88b":true,"xn--ses554g":true,"xn--t60b56a":true,"xn--tckwe":true,"xn--unup4y":true,"xn--vermgensberater-ctb":true,"xn--vermgensberatung-pwb":true,"xn--vhquv":true,"xn--vuq861b":true,"xn--xhq521b":true,"xn--zfr164b":true,"xyz":true,"yachts":true,"yahoo":true,"yamaxun":true,"yandex":true,"yodobashi":true,"yoga":true,"yokohama":true,"youtube":true,"yun":true,"zara":true,"zero":true,"zip":true,"zone":true,"zuerich":true,"cloudfront.net":true,"ap-northeast-1.compute.amazonaws.com":true,"ap-southeast-1.compute.amazonaws.com":true,"ap-southeast-2.compute.amazonaws.com":true,"cn-north-1.compute.amazonaws.cn":true,"compute.amazonaws.cn":true,"compute.amazonaws.com":true,"compute-1.amazonaws.com":true,"eu-west-1.compute.amazonaws.com":true,"eu-central-1.compute.amazonaws.com":true,"sa-east-1.compute.amazonaws.com":true,"us-east-1.amazonaws.com":true,"us-gov-west-1.compute.amazonaws.com":true,"us-west-1.compute.amazonaws.com":true,"us-west-2.compute.amazonaws.com":true,"z-1.compute-1.amazonaws.com":true,"z-2.compute-1.amazonaws.com":true,"elasticbeanstalk.com":true,"elb.amazonaws.com":true,"s3.amazonaws.com":true,"s3-us-west-2.amazonaws.com":true,"s3-us-west-1.amazonaws.com":true,"s3-eu-west-1.amazonaws.com":true,"s3-ap-southeast-1.amazonaws.com":true,"s3-ap-southeast-2.amazonaws.com":true,"s3-ap-northeast-1.amazonaws.com":true,"s3-sa-east-1.amazonaws.com":true,"s3-us-gov-west-1.amazonaws.com":true,"s3-fips-us-gov-west-1.amazonaws.com":true,"s3-website-us-east-1.amazonaws.com":true,"s3-website-us-west-2.amazonaws.com":true,"s3-website-us-west-1.amazonaws.com":true,"s3-website-eu-west-1.amazonaws.com":true,"s3-website-ap-southeast-1.amazonaws.com":true,"s3-website-ap-southeast-2.amazonaws.com":true,"s3-website-ap-northeast-1.amazonaws.com":true,"s3-website-sa-east-1.amazonaws.com":true,"s3-website-us-gov-west-1.amazonaws.com":true,"betainabox.com":true,"ae.org":true,"ar.com":true,"br.com":true,"cn.com":true,"com.de":true,"com.se":true,"de.com":true,"eu.com":true,"gb.com":true,"gb.net":true,"hu.com":true,"hu.net":true,"jp.net":true,"jpn.com":true,"kr.com":true,"mex.com":true,"no.com":true,"qc.com":true,"ru.com":true,"sa.com":true,"se.com":true,"se.net":true,"uk.com":true,"uk.net":true,"us.com":true,"uy.com":true,"za.bz":true,"za.com":true,"africa.com":true,"gr.com":true,"in.net":true,"us.org":true,"co.com":true,"c.la":true,"cloudcontrolled.com":true,"cloudcontrolapp.com":true,"co.ca":true,"co.nl":true,"co.no":true,"*.platform.sh":true,"cupcake.is":true,"dreamhosters.com":true,"dyndns-at-home.com":true,"dyndns-at-work.com":true,"dyndns-blog.com":true,"dyndns-free.com":true,"dyndns-home.com":true,"dyndns-ip.com":true,"dyndns-mail.com":true,"dyndns-office.com":true,"dyndns-pics.com":true,"dyndns-remote.com":true,"dyndns-server.com":true,"dyndns-web.com":true,"dyndns-wiki.com":true,"dyndns-work.com":true,"dyndns.biz":true,"dyndns.info":true,"dyndns.org":true,"dyndns.tv":true,"at-band-camp.net":true,"ath.cx":true,"barrel-of-knowledge.info":true,"barrell-of-knowledge.info":true,"better-than.tv":true,"blogdns.com":true,"blogdns.net":true,"blogdns.org":true,"blogsite.org":true,"boldlygoingnowhere.org":true,"broke-it.net":true,"buyshouses.net":true,"cechire.com":true,"dnsalias.com":true,"dnsalias.net":true,"dnsalias.org":true,"dnsdojo.com":true,"dnsdojo.net":true,"dnsdojo.org":true,"does-it.net":true,"doesntexist.com":true,"doesntexist.org":true,"dontexist.com":true,"dontexist.net":true,"dontexist.org":true,"doomdns.com":true,"doomdns.org":true,"dvrdns.org":true,"dyn-o-saur.com":true,"dynalias.com":true,"dynalias.net":true,"dynalias.org":true,"dynathome.net":true,"dyndns.ws":true,"endofinternet.net":true,"endofinternet.org":true,"endoftheinternet.org":true,"est-a-la-maison.com":true,"est-a-la-masion.com":true,"est-le-patron.com":true,"est-mon-blogueur.com":true,"for-better.biz":true,"for-more.biz":true,"for-our.info":true,"for-some.biz":true,"for-the.biz":true,"forgot.her.name":true,"forgot.his.name":true,"from-ak.com":true,"from-al.com":true,"from-ar.com":true,"from-az.net":true,"from-ca.com":true,"from-co.net":true,"from-ct.com":true,"from-dc.com":true,"from-de.com":true,"from-fl.com":true,"from-ga.com":true,"from-hi.com":true,"from-ia.com":true,"from-id.com":true,"from-il.com":true,"from-in.com":true,"from-ks.com":true,"from-ky.com":true,"from-la.net":true,"from-ma.com":true,"from-md.com":true,"from-me.org":true,"from-mi.com":true,"from-mn.com":true,"from-mo.com":true,"from-ms.com":true,"from-mt.com":true,"from-nc.com":true,"from-nd.com":true,"from-ne.com":true,"from-nh.com":true,"from-nj.com":true,"from-nm.com":true,"from-nv.com":true,"from-ny.net":true,"from-oh.com":true,"from-ok.com":true,"from-or.com":true,"from-pa.com":true,"from-pr.com":true,"from-ri.com":true,"from-sc.com":true,"from-sd.com":true,"from-tn.com":true,"from-tx.com":true,"from-ut.com":true,"from-va.com":true,"from-vt.com":true,"from-wa.com":true,"from-wi.com":true,"from-wv.com":true,"from-wy.com":true,"ftpaccess.cc":true,"fuettertdasnetz.de":true,"game-host.org":true,"game-server.cc":true,"getmyip.com":true,"gets-it.net":true,"go.dyndns.org":true,"gotdns.com":true,"gotdns.org":true,"groks-the.info":true,"groks-this.info":true,"ham-radio-op.net":true,"here-for-more.info":true,"hobby-site.com":true,"hobby-site.org":true,"home.dyndns.org":true,"homedns.org":true,"homeftp.net":true,"homeftp.org":true,"homeip.net":true,"homelinux.com":true,"homelinux.net":true,"homelinux.org":true,"homeunix.com":true,"homeunix.net":true,"homeunix.org":true,"iamallama.com":true,"in-the-band.net":true,"is-a-anarchist.com":true,"is-a-blogger.com":true,"is-a-bookkeeper.com":true,"is-a-bruinsfan.org":true,"is-a-bulls-fan.com":true,"is-a-candidate.org":true,"is-a-caterer.com":true,"is-a-celticsfan.org":true,"is-a-chef.com":true,"is-a-chef.net":true,"is-a-chef.org":true,"is-a-conservative.com":true,"is-a-cpa.com":true,"is-a-cubicle-slave.com":true,"is-a-democrat.com":true,"is-a-designer.com":true,"is-a-doctor.com":true,"is-a-financialadvisor.com":true,"is-a-geek.com":true,"is-a-geek.net":true,"is-a-geek.org":true,"is-a-green.com":true,"is-a-guru.com":true,"is-a-hard-worker.com":true,"is-a-hunter.com":true,"is-a-knight.org":true,"is-a-landscaper.com":true,"is-a-lawyer.com":true,"is-a-liberal.com":true,"is-a-libertarian.com":true,"is-a-linux-user.org":true,"is-a-llama.com":true,"is-a-musician.com":true,"is-a-nascarfan.com":true,"is-a-nurse.com":true,"is-a-painter.com":true,"is-a-patsfan.org":true,"is-a-personaltrainer.com":true,"is-a-photographer.com":true,"is-a-player.com":true,"is-a-republican.com":true,"is-a-rockstar.com":true,"is-a-socialist.com":true,"is-a-soxfan.org":true,"is-a-student.com":true,"is-a-teacher.com":true,"is-a-techie.com":true,"is-a-therapist.com":true,"is-an-accountant.com":true,"is-an-actor.com":true,"is-an-actress.com":true,"is-an-anarchist.com":true,"is-an-artist.com":true,"is-an-engineer.com":true,"is-an-entertainer.com":true,"is-by.us":true,"is-certified.com":true,"is-found.org":true,"is-gone.com":true,"is-into-anime.com":true,"is-into-cars.com":true,"is-into-cartoons.com":true,"is-into-games.com":true,"is-leet.com":true,"is-lost.org":true,"is-not-certified.com":true,"is-saved.org":true,"is-slick.com":true,"is-uberleet.com":true,"is-very-bad.org":true,"is-very-evil.org":true,"is-very-good.org":true,"is-very-nice.org":true,"is-very-sweet.org":true,"is-with-theband.com":true,"isa-geek.com":true,"isa-geek.net":true,"isa-geek.org":true,"isa-hockeynut.com":true,"issmarterthanyou.com":true,"isteingeek.de":true,"istmein.de":true,"kicks-ass.net":true,"kicks-ass.org":true,"knowsitall.info":true,"land-4-sale.us":true,"lebtimnetz.de":true,"leitungsen.de":true,"likes-pie.com":true,"likescandy.com":true,"merseine.nu":true,"mine.nu":true,"misconfused.org":true,"mypets.ws":true,"myphotos.cc":true,"neat-url.com":true,"office-on-the.net":true,"on-the-web.tv":true,"podzone.net":true,"podzone.org":true,"readmyblog.org":true,"saves-the-whales.com":true,"scrapper-site.net":true,"scrapping.cc":true,"selfip.biz":true,"selfip.com":true,"selfip.info":true,"selfip.net":true,"selfip.org":true,"sells-for-less.com":true,"sells-for-u.com":true,"sells-it.net":true,"sellsyourhome.org":true,"servebbs.com":true,"servebbs.net":true,"servebbs.org":true,"serveftp.net":true,"serveftp.org":true,"servegame.org":true,"shacknet.nu":true,"simple-url.com":true,"space-to-rent.com":true,"stuff-4-sale.org":true,"stuff-4-sale.us":true,"teaches-yoga.com":true,"thruhere.net":true,"traeumtgerade.de":true,"webhop.biz":true,"webhop.info":true,"webhop.net":true,"webhop.org":true,"worse-than.tv":true,"writesthisblog.com":true,"a.ssl.fastly.net":true,"b.ssl.fastly.net":true,"global.ssl.fastly.net":true,"a.prod.fastly.net":true,"global.prod.fastly.net":true,"firebaseapp.com":true,"flynnhub.com":true,"service.gov.uk":true,"github.io":true,"githubusercontent.com":true,"ro.com":true,"appspot.com":true,"blogspot.ae":true,"blogspot.be":true,"blogspot.bj":true,"blogspot.ca":true,"blogspot.cf":true,"blogspot.ch":true,"blogspot.co.at":true,"blogspot.co.il":true,"blogspot.co.nz":true,"blogspot.co.uk":true,"blogspot.com":true,"blogspot.com.ar":true,"blogspot.com.au":true,"blogspot.com.br":true,"blogspot.com.es":true,"blogspot.com.tr":true,"blogspot.cv":true,"blogspot.cz":true,"blogspot.de":true,"blogspot.dk":true,"blogspot.fi":true,"blogspot.fr":true,"blogspot.gr":true,"blogspot.hk":true,"blogspot.hu":true,"blogspot.ie":true,"blogspot.in":true,"blogspot.it":true,"blogspot.jp":true,"blogspot.kr":true,"blogspot.mr":true,"blogspot.mx":true,"blogspot.nl":true,"blogspot.no":true,"blogspot.pt":true,"blogspot.re":true,"blogspot.ro":true,"blogspot.ru":true,"blogspot.se":true,"blogspot.sg":true,"blogspot.sk":true,"blogspot.td":true,"blogspot.tw":true,"codespot.com":true,"googleapis.com":true,"googlecode.com":true,"pagespeedmobilizer.com":true,"withgoogle.com":true,"herokuapp.com":true,"herokussl.com":true,"iki.fi":true,"biz.at":true,"info.at":true,"co.pl":true,"azurewebsites.net":true,"azure-mobile.net":true,"cloudapp.net":true,"nfshost.com":true,"nyc.mn":true,"nid.io":true,"operaunite.com":true,"outsystemscloud.com":true,"art.pl":true,"gliwice.pl":true,"krakow.pl":true,"poznan.pl":true,"wroc.pl":true,"zakopane.pl":true,"priv.at":true,"rhcloud.com":true,"sinaapp.com":true,"vipsinaapp.com":true,"1kapp.com":true,"gda.pl":true,"gdansk.pl":true,"gdynia.pl":true,"med.pl":true,"sopot.pl":true,"hk.com":true,"hk.org":true,"ltd.hk":true,"inc.hk":true,"yolasite.com":true,"za.net":true,"za.org":true});

// END of automatically generated file

},{"punycode":undefined}],108:[function(require,module,exports){
/*!
 * Copyright (c) 2015, Salesforce.com, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Salesforce.com nor the names of its contributors may
 * be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
'use strict';
/*jshint unused:false */

function Store() {
}
exports.Store = Store;

// Stores may be synchronous, but are still required to use a
// Continuation-Passing Style API.  The CookieJar itself will expose a "*Sync"
// API that converts from synchronous-callbacks to imperative style.
Store.prototype.synchronous = false;

Store.prototype.findCookie = function(domain, path, key, cb) {
  throw new Error('findCookie is not implemented');
};

Store.prototype.findCookies = function(domain, path, cb) {
  throw new Error('findCookies is not implemented');
};

Store.prototype.putCookie = function(cookie, cb) {
  throw new Error('putCookie is not implemented');
};

Store.prototype.updateCookie = function(oldCookie, newCookie, cb) {
  // recommended default implementation:
  // return this.putCookie(newCookie, cb);
  throw new Error('updateCookie is not implemented');
};

Store.prototype.removeCookie = function(domain, path, key, cb) {
  throw new Error('removeCookie is not implemented');
};

Store.prototype.removeCookies = function(domain, path, cb) {
  throw new Error('removeCookies is not implemented');
};

Store.prototype.getAllCookies = function(cb) {
  throw new Error('getAllCookies is not implemented (therefore jar cannot be serialized)');
};

},{}],109:[function(require,module,exports){
module.exports={
  "author": {
    "name": "Jeremy Stashewsky",
    "email": "jstashewsky@salesforce.com"
  },
  "license": "BSD-3-Clause",
  "name": "tough-cookie",
  "description": "RFC6265 Cookies and Cookie Jar for node.js",
  "keywords": [
    "HTTP",
    "cookie",
    "cookies",
    "set-cookie",
    "cookiejar",
    "jar",
    "RFC6265",
    "RFC2965"
  ],
  "version": "2.0.0",
  "homepage": "https://github.com/SalesforceEng/tough-cookie",
  "repository": {
    "type": "git",
    "url": "git://github.com/SalesforceEng/tough-cookie.git"
  },
  "bugs": {
    "url": "https://github.com/SalesforceEng/tough-cookie/issues"
  },
  "main": "./lib/cookie",
  "scripts": {
    "test": "vows test/*_test.js"
  },
  "engines": {
    "node": ">=0.10.0"
  },
  "devDependencies": {
    "vows": "0.7.0",
    "async": ">=0.1.12"
  },
  "gitHead": "a3af6104da7787c23bb98910109b0e0e8a10153c",
  "_id": "tough-cookie@2.0.0",
  "_shasum": "41ce08720b35cf90beb044dd2609fb19e928718f",
  "_from": "tough-cookie@>=0.12.0",
  "_npmVersion": "2.7.4",
  "_nodeVersion": "0.12.2",
  "_npmUser": {
    "name": "jstash",
    "email": "jstash@gmail.com"
  },
  "dist": {
    "shasum": "41ce08720b35cf90beb044dd2609fb19e928718f",
    "tarball": "http://registry.npmjs.org/tough-cookie/-/tough-cookie-2.0.0.tgz"
  },
  "maintainers": [
    {
      "name": "jstash",
      "email": "jeremy@goinstant.com"
    },
    {
      "name": "goinstant",
      "email": "services@goinstant.com"
    }
  ],
  "directories": {},
  "_resolved": "https://registry.npmjs.org/tough-cookie/-/tough-cookie-2.0.0.tgz",
  "readme": "ERROR: No README data found!"
}

},{}],110:[function(require,module,exports){
'use strict'

var net = require('net')
  , tls = require('tls')
  , http = require('http')
  , https = require('https')
  , events = require('events')
  , assert = require('assert')
  , util = require('util')
  ;

exports.httpOverHttp = httpOverHttp
exports.httpsOverHttp = httpsOverHttp
exports.httpOverHttps = httpOverHttps
exports.httpsOverHttps = httpsOverHttps


function httpOverHttp(options) {
  var agent = new TunnelingAgent(options)
  agent.request = http.request
  return agent
}

function httpsOverHttp(options) {
  var agent = new TunnelingAgent(options)
  agent.request = http.request
  agent.createSocket = createSecureSocket
  return agent
}

function httpOverHttps(options) {
  var agent = new TunnelingAgent(options)
  agent.request = https.request
  return agent
}

function httpsOverHttps(options) {
  var agent = new TunnelingAgent(options)
  agent.request = https.request
  agent.createSocket = createSecureSocket
  return agent
}


function TunnelingAgent(options) {
  var self = this
  self.options = options || {}
  self.proxyOptions = self.options.proxy || {}
  self.maxSockets = self.options.maxSockets || http.Agent.defaultMaxSockets
  self.requests = []
  self.sockets = []

  self.on('free', function onFree(socket, host, port) {
    for (var i = 0, len = self.requests.length; i < len; ++i) {
      var pending = self.requests[i]
      if (pending.host === host && pending.port === port) {
        // Detect the request to connect same origin server,
        // reuse the connection.
        self.requests.splice(i, 1)
        pending.request.onSocket(socket)
        return
      }
    }
    socket.destroy()
    self.removeSocket(socket)
  })
}
util.inherits(TunnelingAgent, events.EventEmitter)

TunnelingAgent.prototype.addRequest = function addRequest(req, options) {
  var self = this

   // Legacy API: addRequest(req, host, port, path)
  if (typeof options === 'string') {
    options = {
      host: options,
      port: arguments[2],
      path: arguments[3]
    };
  }

  if (self.sockets.length >= this.maxSockets) {
    // We are over limit so we'll add it to the queue.
    self.requests.push({host: options.host, port: options.port, request: req})
    return
  }

  // If we are under maxSockets create a new one.
  self.createConnection({host: options.host, port: options.port, request: req})
}

TunnelingAgent.prototype.createConnection = function createConnection(pending) {
  var self = this

  self.createSocket(pending, function(socket) {
    socket.on('free', onFree)
    socket.on('close', onCloseOrRemove)
    socket.on('agentRemove', onCloseOrRemove)
    pending.request.onSocket(socket)

    function onFree() {
      self.emit('free', socket, pending.host, pending.port)
    }

    function onCloseOrRemove(err) {
      self.removeSocket(socket)
      socket.removeListener('free', onFree)
      socket.removeListener('close', onCloseOrRemove)
      socket.removeListener('agentRemove', onCloseOrRemove)
    }
  })
}

TunnelingAgent.prototype.createSocket = function createSocket(options, cb) {
  var self = this
  var placeholder = {}
  self.sockets.push(placeholder)

  var connectOptions = mergeOptions({}, self.proxyOptions, 
    { method: 'CONNECT'
    , path: options.host + ':' + options.port
    , agent: false
    }
  )
  if (connectOptions.proxyAuth) {
    connectOptions.headers = connectOptions.headers || {}
    connectOptions.headers['Proxy-Authorization'] = 'Basic ' +
        new Buffer(connectOptions.proxyAuth).toString('base64')
  }

  debug('making CONNECT request')
  var connectReq = self.request(connectOptions)
  connectReq.useChunkedEncodingByDefault = false // for v0.6
  connectReq.once('response', onResponse) // for v0.6
  connectReq.once('upgrade', onUpgrade)   // for v0.6
  connectReq.once('connect', onConnect)   // for v0.7 or later
  connectReq.once('error', onError)
  connectReq.end()

  function onResponse(res) {
    // Very hacky. This is necessary to avoid http-parser leaks.
    res.upgrade = true
  }

  function onUpgrade(res, socket, head) {
    // Hacky.
    process.nextTick(function() {
      onConnect(res, socket, head)
    })
  }

  function onConnect(res, socket, head) {
    connectReq.removeAllListeners()
    socket.removeAllListeners()

    if (res.statusCode === 200) {
      assert.equal(head.length, 0)
      debug('tunneling connection has established')
      self.sockets[self.sockets.indexOf(placeholder)] = socket
      cb(socket)
    } else {
      debug('tunneling socket could not be established, statusCode=%d', res.statusCode)
      var error = new Error('tunneling socket could not be established, ' + 'statusCode=' + res.statusCode)
      error.code = 'ECONNRESET'
      options.request.emit('error', error)
      self.removeSocket(placeholder)
    }
  }

  function onError(cause) {
    connectReq.removeAllListeners()

    debug('tunneling socket could not be established, cause=%s\n', cause.message, cause.stack)
    var error = new Error('tunneling socket could not be established, ' + 'cause=' + cause.message)
    error.code = 'ECONNRESET'
    options.request.emit('error', error)
    self.removeSocket(placeholder)
  }
}

TunnelingAgent.prototype.removeSocket = function removeSocket(socket) {
  var pos = this.sockets.indexOf(socket)
  if (pos === -1) return
  
  this.sockets.splice(pos, 1)

  var pending = this.requests.shift()
  if (pending) {
    // If we have pending requests and a socket gets closed a new one
    // needs to be created to take over in the pool for the one that closed.
    this.createConnection(pending)
  }
}

function createSecureSocket(options, cb) {
  var self = this
  TunnelingAgent.prototype.createSocket.call(self, options, function(socket) {
    // 0 is dummy port for v0.6
    var secureSocket = tls.connect(0, mergeOptions({}, self.options, 
      { servername: options.host
      , socket: socket
      }
    ))
    self.sockets[self.sockets.indexOf(socket)] = secureSocket
    cb(secureSocket)
  })
}


function mergeOptions(target) {
  for (var i = 1, len = arguments.length; i < len; ++i) {
    var overrides = arguments[i]
    if (typeof overrides === 'object') {
      var keys = Object.keys(overrides)
      for (var j = 0, keyLen = keys.length; j < keyLen; ++j) {
        var k = keys[j]
        if (overrides[k] !== undefined) {
          target[k] = overrides[k]
        }
      }
    }
  }
  return target
}


var debug
if (process.env.NODE_DEBUG && /\btunnel\b/.test(process.env.NODE_DEBUG)) {
  debug = function() {
    var args = Array.prototype.slice.call(arguments)
    if (typeof args[0] === 'string') {
      args[0] = 'TUNNEL: ' + args[0]
    } else {
      args.unshift('TUNNEL:')
    }
    console.error.apply(console, args)
  }
} else {
  debug = function() {}
}
exports.debug = debug // for test

},{"assert":undefined,"events":undefined,"http":undefined,"https":undefined,"net":undefined,"tls":undefined,"util":undefined}],111:[function(require,module,exports){
'use strict'

var http = require('http')
  , https = require('https')
  , url = require('url')
  , util = require('util')
  , stream = require('stream')
  , zlib = require('zlib')
  , bl = require('bl')
  , hawk = require('hawk')
  , aws = require('aws-sign2')
  , httpSignature = require('http-signature')
  , mime = require('mime-types')
  , stringstream = require('stringstream')
  , caseless = require('caseless')
  , ForeverAgent = require('forever-agent')
  , FormData = require('form-data')
  , helpers = require('./lib/helpers')
  , cookies = require('./lib/cookies')
  , getProxyFromURI = require('./lib/getProxyFromURI')
  , Querystring = require('./lib/querystring').Querystring
  , Har = require('./lib/har').Har
  , Auth = require('./lib/auth').Auth
  , OAuth = require('./lib/oauth').OAuth
  , Multipart = require('./lib/multipart').Multipart
  , Redirect = require('./lib/redirect').Redirect
  , Tunnel = require('./lib/tunnel').Tunnel

var safeStringify = helpers.safeStringify
  , isReadStream = helpers.isReadStream
  , toBase64 = helpers.toBase64
  , defer = helpers.defer
  , copy = helpers.copy
  , version = helpers.version
  , globalCookieJar = cookies.jar()


var globalPool = {}

function filterForNonReserved(reserved, options) {
  // Filter out properties that are not reserved.
  // Reserved values are passed in at call site.

  var object = {}
  for (var i in options) {
    var notReserved = (reserved.indexOf(i) === -1)
    if (notReserved) {
      object[i] = options[i]
    }
  }
  return object
}

function filterOutReservedFunctions(reserved, options) {
  // Filter out properties that are functions and are reserved.
  // Reserved values are passed in at call site.

  var object = {}
  for (var i in options) {
    var isReserved = !(reserved.indexOf(i) === -1)
    var isFunction = (typeof options[i] === 'function')
    if (!(isReserved && isFunction)) {
      object[i] = options[i]
    }
  }
  return object

}

// Function for properly handling a connection error
function connectionErrorHandler(error) {
  var socket = this
  if (socket.res) {
    if (socket.res.request) {
      socket.res.request.emit('error', error)
    } else {
      socket.res.emit('error', error)
    }
  } else {
    socket._httpMessage.emit('error', error)
  }
}

// Return a simpler request object to allow serialization
function requestToJSON() {
  var self = this
  return {
    uri: self.uri,
    method: self.method,
    headers: self.headers
  }
}

// Return a simpler response object to allow serialization
function responseToJSON() {
  var self = this
  return {
    statusCode: self.statusCode,
    body: self.body,
    headers: self.headers,
    request: requestToJSON.call(self.request)
  }
}

function Request (options) {
  // if given the method property in options, set property explicitMethod to true

  // extend the Request instance with any non-reserved properties
  // remove any reserved functions from the options object
  // set Request instance to be readable and writable
  // call init

  var self = this

  // start with HAR, then override with additional options
  if (options.har) {
    self._har = new Har(self)
    options = self._har.options(options)
  }

  stream.Stream.call(self)
  var reserved = Object.keys(Request.prototype)
  var nonReserved = filterForNonReserved(reserved, options)

  stream.Stream.call(self)
  util._extend(self, nonReserved)
  options = filterOutReservedFunctions(reserved, options)

  self.readable = true
  self.writable = true
  if (options.method) {
    self.explicitMethod = true
  }
  self._qs = new Querystring(self)
  self._auth = new Auth(self)
  self._oauth = new OAuth(self)
  self._multipart = new Multipart(self)
  self._redirect = new Redirect(self)
  self._tunnel = new Tunnel(self)
  self.init(options)
}

util.inherits(Request, stream.Stream)

// Debugging
Request.debug = process.env.NODE_DEBUG && /\brequest\b/.test(process.env.NODE_DEBUG)
function debug() {
  if (Request.debug) {
    console.error('REQUEST %s', util.format.apply(util, arguments))
  }
}
Request.prototype.debug = debug

Request.prototype.init = function (options) {
  // init() contains all the code to setup the request object.
  // the actual outgoing request is not started until start() is called
  // this function is called from both the constructor and on redirect.
  var self = this
  if (!options) {
    options = {}
  }
  self.headers = self.headers ? copy(self.headers) : {}

  // Delete headers with value undefined since they break
  // ClientRequest.OutgoingMessage.setHeader in node 0.12
  for (var headerName in self.headers) {
    if (typeof self.headers[headerName] === 'undefined') {
      delete self.headers[headerName]
    }
  }

  caseless.httpify(self, self.headers)

  if (!self.method) {
    self.method = options.method || 'GET'
  }
  if (!self.localAddress) {
    self.localAddress = options.localAddress
  }

  self._qs.init(options)

  debug(options)
  if (!self.pool && self.pool !== false) {
    self.pool = globalPool
  }
  self.dests = self.dests || []
  self.__isRequestRequest = true

  // Protect against double callback
  if (!self._callback && self.callback) {
    self._callback = self.callback
    self.callback = function () {
      if (self._callbackCalled) {
        return // Print a warning maybe?
      }
      self._callbackCalled = true
      self._callback.apply(self, arguments)
    }
    self.on('error', self.callback.bind())
    self.on('complete', self.callback.bind(self, null))
  }

  // People use this property instead all the time, so support it
  if (!self.uri && self.url) {
    self.uri = self.url
    delete self.url
  }

  // If there's a baseUrl, then use it as the base URL (i.e. uri must be
  // specified as a relative path and is appended to baseUrl).
  if (self.baseUrl) {
    if (typeof self.baseUrl !== 'string') {
      return self.emit('error', new Error('options.baseUrl must be a string'))
    }

    if (typeof self.uri !== 'string') {
      return self.emit('error', new Error('options.uri must be a string when using options.baseUrl'))
    }

    if (self.uri.indexOf('//') === 0 || self.uri.indexOf('://') !== -1) {
      return self.emit('error', new Error('options.uri must be a path when using options.baseUrl'))
    }

    // Handle all cases to make sure that there's only one slash between
    // baseUrl and uri.
    var baseUrlEndsWithSlash = self.baseUrl.lastIndexOf('/') === self.baseUrl.length - 1
    var uriStartsWithSlash = self.uri.indexOf('/') === 0

    if (baseUrlEndsWithSlash && uriStartsWithSlash) {
      self.uri = self.baseUrl + self.uri.slice(1)
    } else if (baseUrlEndsWithSlash || uriStartsWithSlash) {
      self.uri = self.baseUrl + self.uri
    } else if (self.uri === '') {
      self.uri = self.baseUrl
    } else {
      self.uri = self.baseUrl + '/' + self.uri
    }
    delete self.baseUrl
  }

  // A URI is needed by this point, emit error if we haven't been able to get one
  if (!self.uri) {
    return self.emit('error', new Error('options.uri is a required argument'))
  }

  // If a string URI/URL was given, parse it into a URL object
  if (typeof self.uri === 'string') {
    self.uri = url.parse(self.uri)
  }

  // DEPRECATED: Warning for users of the old Unix Sockets URL Scheme
  if (self.uri.protocol === 'unix:') {
    return self.emit('error', new Error('`unix://` URL scheme is no longer supported. Please use the format `http://unix:SOCKET:PATH`'))
  }

  // Support Unix Sockets
  if (self.uri.host === 'unix') {
    // Get the socket & request paths from the URL
    var unixParts = self.uri.path.split(':')
      , host = unixParts[0]
      , path = unixParts[1]
    // Apply unix properties to request
    self.socketPath = host
    self.uri.pathname = path
    self.uri.path = path
    self.uri.host = host
    self.uri.hostname = host
    self.uri.isUnix = true
  }

  if (self.strictSSL === false) {
    self.rejectUnauthorized = false
  }

  if (!self.uri.pathname) {self.uri.pathname = '/'}

  if (!(self.uri.host || (self.uri.hostname && self.uri.port)) && !self.uri.isUnix) {
    // Invalid URI: it may generate lot of bad errors, like 'TypeError: Cannot call method `indexOf` of undefined' in CookieJar
    // Detect and reject it as soon as possible
    var faultyUri = url.format(self.uri)
    var message = 'Invalid URI "' + faultyUri + '"'
    if (Object.keys(options).length === 0) {
      // No option ? This can be the sign of a redirect
      // As this is a case where the user cannot do anything (they didn't call request directly with this URL)
      // they should be warned that it can be caused by a redirection (can save some hair)
      message += '. This can be caused by a crappy redirection.'
    }
    // This error was fatal
    return self.emit('error', new Error(message))
  }

  if (!self.hasOwnProperty('proxy')) {
    self.proxy = getProxyFromURI(self.uri)
  }

  self.tunnel = self._tunnel.isEnabled(options)
  if (self.proxy) {
    self._tunnel.setup(options)
  }

  self._redirect.onRequest(options)

  self.setHost = false
  if (!self.hasHeader('host')) {
    var hostHeaderName = self.originalHostHeaderName || 'host'
    self.setHeader(hostHeaderName, self.uri.hostname)
    if (self.uri.port) {
      if ( !(self.uri.port === 80 && self.uri.protocol === 'http:') &&
           !(self.uri.port === 443 && self.uri.protocol === 'https:') ) {
        self.setHeader(hostHeaderName, self.getHeader('host') + (':' + self.uri.port) )
      }
    }
    self.setHost = true
  }

  self.jar(self._jar || options.jar)

  if (!self.uri.port) {
    if (self.uri.protocol === 'http:') {self.uri.port = 80}
    else if (self.uri.protocol === 'https:') {self.uri.port = 443}
  }

  if (self.proxy && !self.tunnel) {
    self.port = self.proxy.port
    self.host = self.proxy.hostname
  } else {
    self.port = self.uri.port
    self.host = self.uri.hostname
  }

  if (options.form) {
    self.form(options.form)
  }

  if (options.formData) {
    var formData = options.formData
    var requestForm = self.form()
    var appendFormValue = function (key, value) {
      if (value.hasOwnProperty('value') && value.hasOwnProperty('options')) {
        requestForm.append(key, value.value, value.options)
      } else {
        requestForm.append(key, value)
      }
    }
    for (var formKey in formData) {
      if (formData.hasOwnProperty(formKey)) {
        var formValue = formData[formKey]
        if (formValue instanceof Array) {
          for (var j = 0; j < formValue.length; j++) {
            appendFormValue(formKey, formValue[j])
          }
        } else {
          appendFormValue(formKey, formValue)
        }
      }
    }
  }

  if (options.qs) {
    self.qs(options.qs)
  }

  if (self.uri.path) {
    self.path = self.uri.path
  } else {
    self.path = self.uri.pathname + (self.uri.search || '')
  }

  if (self.path.length === 0) {
    self.path = '/'
  }

  // Auth must happen last in case signing is dependent on other headers
  if (options.aws) {
    self.aws(options.aws)
  }

  if (options.hawk) {
    self.hawk(options.hawk)
  }

  if (options.httpSignature) {
    self.httpSignature(options.httpSignature)
  }

  if (options.auth) {
    if (Object.prototype.hasOwnProperty.call(options.auth, 'username')) {
      options.auth.user = options.auth.username
    }
    if (Object.prototype.hasOwnProperty.call(options.auth, 'password')) {
      options.auth.pass = options.auth.password
    }

    self.auth(
      options.auth.user,
      options.auth.pass,
      options.auth.sendImmediately,
      options.auth.bearer
    )
  }

  if (self.gzip && !self.hasHeader('accept-encoding')) {
    self.setHeader('accept-encoding', 'gzip')
  }

  if (self.uri.auth && !self.hasHeader('authorization')) {
    var uriAuthPieces = self.uri.auth.split(':').map(function(item) {return self._qs.unescape(item)})
    self.auth(uriAuthPieces[0], uriAuthPieces.slice(1).join(':'), true)
  }

  if (!self.tunnel && self.proxy && self.proxy.auth && !self.hasHeader('proxy-authorization')) {
    var proxyAuthPieces = self.proxy.auth.split(':').map(function(item) {return self._qs.unescape(item)})
    var authHeader = 'Basic ' + toBase64(proxyAuthPieces.join(':'))
    self.setHeader('proxy-authorization', authHeader)
  }

  if (self.proxy && !self.tunnel) {
    self.path = (self.uri.protocol + '//' + self.uri.host + self.path)
  }

  if (options.json) {
    self.json(options.json)
  }
  if (options.multipart) {
    self.multipart(options.multipart)
  }

  if (options.time) {
    self.timing = true
    self.elapsedTime = self.elapsedTime || 0
  }

  function setContentLength () {
    if (!Buffer.isBuffer(self.body) && !Array.isArray(self.body)) {
      self.body = new Buffer(self.body)
    }
    if (!self.hasHeader('content-length')) {
      var length = (Array.isArray(self.body))
        ? self.body.reduce(function (a, b) {return a + b.length}, 0)
        : self.body.length
      if (length) {
        self.setHeader('content-length', length)
      } else {
        self.emit('error', new Error('Argument error, options.body.'))
      }
    }
  }
  if (self.body) {
    setContentLength()
  }

  if (options.oauth) {
    self.oauth(options.oauth)
  } else if (self._oauth.params && self.hasHeader('authorization')) {
    self.oauth(self._oauth.params)
  }

  var protocol = self.proxy && !self.tunnel ? self.proxy.protocol : self.uri.protocol
    , defaultModules = {'http:':http, 'https:':https}
    , httpModules = self.httpModules || {}

  self.httpModule = httpModules[protocol] || defaultModules[protocol]

  if (!self.httpModule) {
    return self.emit('error', new Error('Invalid protocol: ' + protocol))
  }

  if (options.ca) {
    self.ca = options.ca
  }

  if (!self.agent) {
    if (options.agentOptions) {
      self.agentOptions = options.agentOptions
    }

    if (options.agentClass) {
      self.agentClass = options.agentClass
    } else if (options.forever) {
      var v = version()
      // use ForeverAgent in node 0.10- only
      if (v.major === 0 && v.minor <= 10) {
        self.agentClass = protocol === 'http:' ? ForeverAgent : ForeverAgent.SSL
      } else {
        self.agent = new self.httpModule.Agent({
          keepAlive: true,
          maxSockets: (options.pool && options.pool.maxSockets) || Infinity
        })
      }
    } else {
      self.agentClass = self.httpModule.Agent
    }
  }

  if (self.pool === false) {
    self.agent = false
  } else {
    self.agent = self.agent || self.getNewAgent()
  }

  self.on('pipe', function (src) {
    if (self.ntick && self._started) {
      self.emit('error', new Error('You cannot pipe to this stream after the outbound request has started.'))
    }
    self.src = src
    if (isReadStream(src)) {
      if (!self.hasHeader('content-type')) {
        self.setHeader('content-type', mime.lookup(src.path))
      }
    } else {
      if (src.headers) {
        for (var i in src.headers) {
          if (!self.hasHeader(i)) {
            self.setHeader(i, src.headers[i])
          }
        }
      }
      if (self._json && !self.hasHeader('content-type')) {
        self.setHeader('content-type', 'application/json')
      }
      if (src.method && !self.explicitMethod) {
        self.method = src.method
      }
    }

    // self.on('pipe', function () {
    //   console.error('You have already piped to this stream. Pipeing twice is likely to break the request.')
    // })
  })

  defer(function () {
    if (self._aborted) {
      return
    }

    var end = function () {
      if (self._form) {
        if (!self._auth.hasAuth) {
          self._form.pipe(self)
        }
        else if (self._auth.hasAuth && self._auth.sentAuth) {
          self._form.pipe(self)
        }
      }
      if (self._multipart && self._multipart.chunked) {
        self._multipart.body.pipe(self)
      }
      if (self.body) {
        setContentLength()
        if (Array.isArray(self.body)) {
          self.body.forEach(function (part) {
            self.write(part)
          })
        } else {
          self.write(self.body)
        }
        self.end()
      } else if (self.requestBodyStream) {
        console.warn('options.requestBodyStream is deprecated, please pass the request object to stream.pipe.')
        self.requestBodyStream.pipe(self)
      } else if (!self.src) {
        if (self._auth.hasAuth && !self._auth.sentAuth) {
          self.end()
          return
        }
        if (self.method !== 'GET' && typeof self.method !== 'undefined') {
          self.setHeader('content-length', 0)
        }
        self.end()
      }
    }

    if (self._form && !self.hasHeader('content-length')) {
      // Before ending the request, we had to compute the length of the whole form, asyncly
      self.setHeader(self._form.getHeaders(), true)
      self._form.getLength(function (err, length) {
        if (!err) {
          self.setHeader('content-length', length)
        }
        end()
      })
    } else {
      end()
    }

    self.ntick = true
  })

}

// Must call this when following a redirect from https to http or vice versa
// Attempts to keep everything as identical as possible, but update the
// httpModule, Tunneling agent, and/or Forever Agent in use.
Request.prototype._updateProtocol = function () {
  var self = this
  var protocol = self.uri.protocol

  if (protocol === 'https:' || self.tunnel) {
    // previously was doing http, now doing https
    // if it's https, then we might need to tunnel now.
    if (self.proxy) {
      if (self._tunnel.setup()) {
        return
      }
    }

    self.httpModule = https
    switch (self.agentClass) {
      case ForeverAgent:
        self.agentClass = ForeverAgent.SSL
        break
      case http.Agent:
        self.agentClass = https.Agent
        break
      default:
        // nothing we can do.  Just hope for the best.
        return
    }

    // if there's an agent, we need to get a new one.
    if (self.agent) {
      self.agent = self.getNewAgent()
    }

  } else {
    // previously was doing https, now doing http
    self.httpModule = http
    switch (self.agentClass) {
      case ForeverAgent.SSL:
        self.agentClass = ForeverAgent
        break
      case https.Agent:
        self.agentClass = http.Agent
        break
      default:
        // nothing we can do.  just hope for the best
        return
    }

    // if there's an agent, then get a new one.
    if (self.agent) {
      self.agent = null
      self.agent = self.getNewAgent()
    }
  }
}

Request.prototype.getNewAgent = function () {
  var self = this
  var Agent = self.agentClass
  var options = {}
  if (self.agentOptions) {
    for (var i in self.agentOptions) {
      options[i] = self.agentOptions[i]
    }
  }
  if (self.ca) {
    options.ca = self.ca
  }
  if (self.ciphers) {
    options.ciphers = self.ciphers
  }
  if (self.secureProtocol) {
    options.secureProtocol = self.secureProtocol
  }
  if (self.secureOptions) {
    options.secureOptions = self.secureOptions
  }
  if (typeof self.rejectUnauthorized !== 'undefined') {
    options.rejectUnauthorized = self.rejectUnauthorized
  }

  if (self.cert && self.key) {
    options.key = self.key
    options.cert = self.cert
  }

  if (self.pfx) {
    options.pfx = self.pfx
  }

  if (self.passphrase) {
    options.passphrase = self.passphrase
  }

  var poolKey = ''

  // different types of agents are in different pools
  if (Agent !== self.httpModule.Agent) {
    poolKey += Agent.name
  }

  // ca option is only relevant if proxy or destination are https
  var proxy = self.proxy
  if (typeof proxy === 'string') {
    proxy = url.parse(proxy)
  }
  var isHttps = (proxy && proxy.protocol === 'https:') || this.uri.protocol === 'https:'

  if (isHttps) {
    if (options.ca) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.ca
    }

    if (typeof options.rejectUnauthorized !== 'undefined') {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.rejectUnauthorized
    }

    if (options.cert) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.cert.toString('ascii') + options.key.toString('ascii')
    }

    if (options.pfx) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.pfx.toString('ascii')
    }

    if (options.ciphers) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.ciphers
    }

    if (options.secureProtocol) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.secureProtocol
    }

    if (options.secureOptions) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.secureOptions
    }
  }

  if (self.pool === globalPool && !poolKey && Object.keys(options).length === 0 && self.httpModule.globalAgent) {
    // not doing anything special.  Use the globalAgent
    return self.httpModule.globalAgent
  }

  // we're using a stored agent.  Make sure it's protocol-specific
  poolKey = self.uri.protocol + poolKey

  // generate a new agent for this setting if none yet exists
  if (!self.pool[poolKey]) {
    self.pool[poolKey] = new Agent(options)
    // properly set maxSockets on new agents
    if (self.pool.maxSockets) {
      self.pool[poolKey].maxSockets = self.pool.maxSockets
    }
  }

  return self.pool[poolKey]
}

Request.prototype.start = function () {
  // start() is called once we are ready to send the outgoing HTTP request.
  // this is usually called on the first write(), end() or on nextTick()
  var self = this

  if (self._aborted) {
    return
  }

  self._started = true
  self.method = self.method || 'GET'
  self.href = self.uri.href

  if (self.src && self.src.stat && self.src.stat.size && !self.hasHeader('content-length')) {
    self.setHeader('content-length', self.src.stat.size)
  }
  if (self._aws) {
    self.aws(self._aws, true)
  }

  // We have a method named auth, which is completely different from the http.request
  // auth option.  If we don't remove it, we're gonna have a bad time.
  var reqOptions = copy(self)
  delete reqOptions.auth

  debug('make request', self.uri.href)

  self.req = self.httpModule.request(reqOptions)

  if (self.timing) {
    self.startTime = new Date().getTime()
  }

  if (self.timeout && !self.timeoutTimer) {
    var timeout = self.timeout < 0 ? 0 : self.timeout
    self.timeoutTimer = setTimeout(function () {
      self.abort()
      var e = new Error('ETIMEDOUT')
      e.code = 'ETIMEDOUT'
      self.emit('error', e)
    }, timeout)

    // Set additional timeout on socket - in case if remote
    // server freeze after sending headers
    if (self.req.setTimeout) { // only works on node 0.6+
      self.req.setTimeout(timeout, function () {
        if (self.req) {
          self.req.abort()
          var e = new Error('ESOCKETTIMEDOUT')
          e.code = 'ESOCKETTIMEDOUT'
          self.emit('error', e)
        }
      })
    }
  }

  self.req.on('response', self.onRequestResponse.bind(self))
  self.req.on('error', self.onRequestError.bind(self))
  self.req.on('drain', function() {
    self.emit('drain')
  })
  self.req.on('socket', function(socket) {
    self.emit('socket', socket)
  })

  self.on('end', function() {
    if ( self.req.connection ) {
      self.req.connection.removeListener('error', connectionErrorHandler)
    }
  })
  self.emit('request', self.req)
}

Request.prototype.onRequestError = function (error) {
  var self = this
  if (self._aborted) {
    return
  }
  if (self.req && self.req._reusedSocket && error.code === 'ECONNRESET'
      && self.agent.addRequestNoreuse) {
    self.agent = { addRequest: self.agent.addRequestNoreuse.bind(self.agent) }
    self.start()
    self.req.end()
    return
  }
  if (self.timeout && self.timeoutTimer) {
    clearTimeout(self.timeoutTimer)
    self.timeoutTimer = null
  }
  self.emit('error', error)
}

Request.prototype.onRequestResponse = function (response) {
  var self = this
  debug('onRequestResponse', self.uri.href, response.statusCode, response.headers)
  response.on('end', function() {
    if (self.timing) {
      self.elapsedTime += (new Date().getTime() - self.startTime)
      debug('elapsed time', self.elapsedTime)
      response.elapsedTime = self.elapsedTime
    }
    debug('response end', self.uri.href, response.statusCode, response.headers)
  })

  // The check on response.connection is a workaround for browserify.
  if (response.connection && response.connection.listeners('error').indexOf(connectionErrorHandler) === -1) {
    response.connection.setMaxListeners(0)
    response.connection.once('error', connectionErrorHandler)
  }
  if (self._aborted) {
    debug('aborted', self.uri.href)
    response.resume()
    return
  }

  self.response = response
  response.request = self
  response.toJSON = responseToJSON

  // XXX This is different on 0.10, because SSL is strict by default
  if (self.httpModule === https &&
      self.strictSSL && (!response.hasOwnProperty('socket') ||
      !response.socket.authorized)) {
    debug('strict ssl error', self.uri.href)
    var sslErr = response.hasOwnProperty('socket') ? response.socket.authorizationError : self.uri.href + ' does not support SSL'
    self.emit('error', new Error('SSL Error: ' + sslErr))
    return
  }

  // Save the original host before any redirect (if it changes, we need to
  // remove any authorization headers).  Also remember the case of the header
  // name because lots of broken servers expect Host instead of host and we
  // want the caller to be able to specify this.
  self.originalHost = self.getHeader('host')
  if (!self.originalHostHeaderName) {
    self.originalHostHeaderName = self.hasHeader('host')
  }
  if (self.setHost) {
    self.removeHeader('host')
  }
  if (self.timeout && self.timeoutTimer) {
    clearTimeout(self.timeoutTimer)
    self.timeoutTimer = null
  }

  var targetCookieJar = (self._jar && self._jar.setCookie) ? self._jar : globalCookieJar
  var addCookie = function (cookie) {
    //set the cookie if it's domain in the href's domain.
    try {
      targetCookieJar.setCookie(cookie, self.uri.href, {ignoreError: true})
    } catch (e) {
      self.emit('error', e)
    }
  }

  response.caseless = caseless(response.headers)

  if (response.caseless.has('set-cookie') && (!self._disableCookies)) {
    var headerName = response.caseless.has('set-cookie')
    if (Array.isArray(response.headers[headerName])) {
      response.headers[headerName].forEach(addCookie)
    } else {
      addCookie(response.headers[headerName])
    }
  }

  if (self._redirect.onResponse(response)) {
    return // Ignore the rest of the response
  } else {
    // Be a good stream and emit end when the response is finished.
    // Hack to emit end on close because of a core bug that never fires end
    response.on('close', function () {
      if (!self._ended) {
        self.response.emit('end')
      }
    })

    response.on('end', function () {
      self._ended = true
    })

    var responseContent
    if (self.gzip) {
      var contentEncoding = response.headers['content-encoding'] || 'identity'
      contentEncoding = contentEncoding.trim().toLowerCase()

      if (contentEncoding === 'gzip') {
        responseContent = zlib.createGunzip()
        response.pipe(responseContent)
      } else {
        // Since previous versions didn't check for Content-Encoding header,
        // ignore any invalid values to preserve backwards-compatibility
        if (contentEncoding !== 'identity') {
          debug('ignoring unrecognized Content-Encoding ' + contentEncoding)
        }
        responseContent = response
      }
    } else {
      responseContent = response
    }

    if (self.encoding) {
      if (self.dests.length !== 0) {
        console.error('Ignoring encoding parameter as this stream is being piped to another stream which makes the encoding option invalid.')
      } else if (responseContent.setEncoding) {
        responseContent.setEncoding(self.encoding)
      } else {
        // Should only occur on node pre-v0.9.4 (joyent/node@9b5abe5) with
        // zlib streams.
        // If/When support for 0.9.4 is dropped, this should be unnecessary.
        responseContent = responseContent.pipe(stringstream(self.encoding))
      }
    }

    if (self._paused) {
      responseContent.pause()
    }

    self.responseContent = responseContent

    self.emit('response', response)

    self.dests.forEach(function (dest) {
      self.pipeDest(dest)
    })

    responseContent.on('data', function (chunk) {
      self._destdata = true
      self.emit('data', chunk)
    })
    responseContent.on('end', function (chunk) {
      self.emit('end', chunk)
    })
    responseContent.on('error', function (error) {
      self.emit('error', error)
    })
    responseContent.on('close', function () {self.emit('close')})

    if (self.callback) {
      var buffer = bl()
        , strings = []

      self.on('data', function (chunk) {
        if (Buffer.isBuffer(chunk)) {
          buffer.append(chunk)
        } else {
          strings.push(chunk)
        }
      })
      self.on('end', function () {
        debug('end event', self.uri.href)
        if (self._aborted) {
          debug('aborted', self.uri.href)
          return
        }

        if (buffer.length) {
          debug('has body', self.uri.href, buffer.length)
          if (self.encoding === null) {
            // response.body = buffer
            // can't move to this until https://github.com/rvagg/bl/issues/13
            response.body = buffer.slice()
          } else {
            response.body = buffer.toString(self.encoding)
          }
        } else if (strings.length) {
          // The UTF8 BOM [0xEF,0xBB,0xBF] is converted to [0xFE,0xFF] in the JS UTC16/UCS2 representation.
          // Strip this value out when the encoding is set to 'utf8', as upstream consumers won't expect it and it breaks JSON.parse().
          if (self.encoding === 'utf8' && strings[0].length > 0 && strings[0][0] === '\uFEFF') {
            strings[0] = strings[0].substring(1)
          }
          response.body = strings.join('')
        }

        if (self._json) {
          try {
            response.body = JSON.parse(response.body, self._jsonReviver)
          } catch (e) {
            // empty
          }
        }
        debug('emitting complete', self.uri.href)
        if (typeof response.body === 'undefined' && !self._json) {
          response.body = self.encoding === null ? new Buffer(0) : ''
        }
        self.emit('complete', response, response.body)
      })
    }
    //if no callback
    else {
      self.on('end', function () {
        if (self._aborted) {
          debug('aborted', self.uri.href)
          return
        }
        self.emit('complete', response)
      })
    }
  }
  debug('finish init function', self.uri.href)
}

Request.prototype.abort = function () {
  var self = this
  self._aborted = true

  if (self.req) {
    self.req.abort()
  }
  else if (self.response) {
    self.response.abort()
  }

  self.emit('abort')
}

Request.prototype.pipeDest = function (dest) {
  var self = this
  var response = self.response
  // Called after the response is received
  if (dest.headers && !dest.headersSent) {
    if (response.caseless.has('content-type')) {
      var ctname = response.caseless.has('content-type')
      if (dest.setHeader) {
        dest.setHeader(ctname, response.headers[ctname])
      }
      else {
        dest.headers[ctname] = response.headers[ctname]
      }
    }

    if (response.caseless.has('content-length')) {
      var clname = response.caseless.has('content-length')
      if (dest.setHeader) {
        dest.setHeader(clname, response.headers[clname])
      } else {
        dest.headers[clname] = response.headers[clname]
      }
    }
  }
  if (dest.setHeader && !dest.headersSent) {
    for (var i in response.headers) {
      // If the response content is being decoded, the Content-Encoding header
      // of the response doesn't represent the piped content, so don't pass it.
      if (!self.gzip || i !== 'content-encoding') {
        dest.setHeader(i, response.headers[i])
      }
    }
    dest.statusCode = response.statusCode
  }
  if (self.pipefilter) {
    self.pipefilter(response, dest)
  }
}

Request.prototype.qs = function (q, clobber) {
  var self = this
  var base
  if (!clobber && self.uri.query) {
    base = self._qs.parse(self.uri.query)
  } else {
    base = {}
  }

  for (var i in q) {
    base[i] = q[i]
  }

  if (self._qs.stringify(base) === '') {
    return self
  }

  var qs = self._qs.stringify(base)

  self.uri = url.parse(self.uri.href.split('?')[0] + '?' + qs)
  self.url = self.uri
  self.path = self.uri.path

  return self
}
Request.prototype.form = function (form) {
  var self = this
  if (form) {
    if (!/^application\/x-www-form-urlencoded\b/.test(self.getHeader('content-type'))) {
      self.setHeader('content-type', 'application/x-www-form-urlencoded')
    }
    self.body = (typeof form === 'string')
      ? self._qs.rfc3986(form.toString('utf8'))
      : self._qs.stringify(form).toString('utf8')
    return self
  }
  // create form-data object
  self._form = new FormData()
  self._form.on('error', function(err) {
    err.message = 'form-data: ' + err.message
    self.emit('error', err)
    self.abort()
  })
  return self._form
}
Request.prototype.multipart = function (multipart) {
  var self = this

  self._multipart.onRequest(multipart)

  if (!self._multipart.chunked) {
    self.body = self._multipart.body
  }

  return self
}
Request.prototype.json = function (val) {
  var self = this

  if (!self.hasHeader('accept')) {
    self.setHeader('accept', 'application/json')
  }

  self._json = true
  if (typeof val === 'boolean') {
    if (self.body !== undefined) {
      if (!/^application\/x-www-form-urlencoded\b/.test(self.getHeader('content-type'))) {
        self.body = safeStringify(self.body)
      } else {
        self.body = self._qs.rfc3986(self.body)
      }
      if (!self.hasHeader('content-type')) {
        self.setHeader('content-type', 'application/json')
      }
    }
  } else {
    self.body = safeStringify(val)
    if (!self.hasHeader('content-type')) {
      self.setHeader('content-type', 'application/json')
    }
  }

  if (typeof self.jsonReviver === 'function') {
    self._jsonReviver = self.jsonReviver
  }

  return self
}
Request.prototype.getHeader = function (name, headers) {
  var self = this
  var result, re, match
  if (!headers) {
    headers = self.headers
  }
  Object.keys(headers).forEach(function (key) {
    if (key.length !== name.length) {
      return
    }
    re = new RegExp(name, 'i')
    match = key.match(re)
    if (match) {
      result = headers[key]
    }
  })
  return result
}

Request.prototype.auth = function (user, pass, sendImmediately, bearer) {
  var self = this

  self._auth.onRequest(user, pass, sendImmediately, bearer)

  return self
}
Request.prototype.aws = function (opts, now) {
  var self = this

  if (!now) {
    self._aws = opts
    return self
  }
  var date = new Date()
  self.setHeader('date', date.toUTCString())
  var auth =
    { key: opts.key
    , secret: opts.secret
    , verb: self.method.toUpperCase()
    , date: date
    , contentType: self.getHeader('content-type') || ''
    , md5: self.getHeader('content-md5') || ''
    , amazonHeaders: aws.canonicalizeHeaders(self.headers)
    }
  var path = self.uri.path
  if (opts.bucket && path) {
    auth.resource = '/' + opts.bucket + path
  } else if (opts.bucket && !path) {
    auth.resource = '/' + opts.bucket
  } else if (!opts.bucket && path) {
    auth.resource = path
  } else if (!opts.bucket && !path) {
    auth.resource = '/'
  }
  auth.resource = aws.canonicalizeResource(auth.resource)
  self.setHeader('authorization', aws.authorization(auth))

  return self
}
Request.prototype.httpSignature = function (opts) {
  var self = this
  httpSignature.signRequest({
    getHeader: function(header) {
      return self.getHeader(header, self.headers)
    },
    setHeader: function(header, value) {
      self.setHeader(header, value)
    },
    method: self.method,
    path: self.path
  }, opts)
  debug('httpSignature authorization', self.getHeader('authorization'))

  return self
}
Request.prototype.hawk = function (opts) {
  var self = this
  self.setHeader('Authorization', hawk.client.header(self.uri, self.method, opts).field)
}
Request.prototype.oauth = function (_oauth) {
  var self = this

  self._oauth.onRequest(_oauth)

  return self
}

Request.prototype.jar = function (jar) {
  var self = this
  var cookies

  if (self._redirect.redirectsFollowed === 0) {
    self.originalCookieHeader = self.getHeader('cookie')
  }

  if (!jar) {
    // disable cookies
    cookies = false
    self._disableCookies = true
  } else {
    var targetCookieJar = (jar && jar.getCookieString) ? jar : globalCookieJar
    var urihref = self.uri.href
    //fetch cookie in the Specified host
    if (targetCookieJar) {
      cookies = targetCookieJar.getCookieString(urihref)
    }
  }

  //if need cookie and cookie is not empty
  if (cookies && cookies.length) {
    if (self.originalCookieHeader) {
      // Don't overwrite existing Cookie header
      self.setHeader('cookie', self.originalCookieHeader + '; ' + cookies)
    } else {
      self.setHeader('cookie', cookies)
    }
  }
  self._jar = jar
  return self
}


// Stream API
Request.prototype.pipe = function (dest, opts) {
  var self = this

  if (self.response) {
    if (self._destdata) {
      self.emit('error', new Error('You cannot pipe after data has been emitted from the response.'))
    } else if (self._ended) {
      self.emit('error', new Error('You cannot pipe after the response has been ended.'))
    } else {
      stream.Stream.prototype.pipe.call(self, dest, opts)
      self.pipeDest(dest)
      return dest
    }
  } else {
    self.dests.push(dest)
    stream.Stream.prototype.pipe.call(self, dest, opts)
    return dest
  }
}
Request.prototype.write = function () {
  var self = this
  if (!self._started) {
    self.start()
  }
  return self.req.write.apply(self.req, arguments)
}
Request.prototype.end = function (chunk) {
  var self = this
  if (chunk) {
    self.write(chunk)
  }
  if (!self._started) {
    self.start()
  }
  self.req.end()
}
Request.prototype.pause = function () {
  var self = this
  if (!self.responseContent) {
    self._paused = true
  } else {
    self.responseContent.pause.apply(self.responseContent, arguments)
  }
}
Request.prototype.resume = function () {
  var self = this
  if (!self.responseContent) {
    self._paused = false
  } else {
    self.responseContent.resume.apply(self.responseContent, arguments)
  }
}
Request.prototype.destroy = function () {
  var self = this
  if (!self._ended) {
    self.end()
  } else if (self.response) {
    self.response.destroy()
  }
}

Request.defaultProxyHeaderWhiteList =
  Tunnel.defaultProxyHeaderWhiteList.slice()

Request.defaultProxyHeaderExclusiveList =
  Tunnel.defaultProxyHeaderExclusiveList.slice()

// Exports

Request.prototype.toJSON = requestToJSON
module.exports = Request

},{"./lib/auth":8,"./lib/cookies":9,"./lib/getProxyFromURI":10,"./lib/har":11,"./lib/helpers":12,"./lib/multipart":13,"./lib/oauth":14,"./lib/querystring":15,"./lib/redirect":16,"./lib/tunnel":17,"aws-sign2":18,"bl":19,"caseless":30,"forever-agent":34,"form-data":35,"hawk":64,"http":undefined,"http-signature":76,"https":undefined,"mime-types":93,"stream":undefined,"stringstream":102,"url":undefined,"util":undefined,"zlib":undefined}]},{},[1]);
