"no use strict";
;(function(window) {
if (typeof window.window != "undefined" && window.document)
    return;
if (window.require && window.define)
    return;

if (!window.console) {
    window.console = function() {
        var msgs = Array.prototype.slice.call(arguments, 0);
        postMessage({type: "log", data: msgs});
    };
    window.console.error =
    window.console.warn = 
    window.console.log =
    window.console.trace = window.console;
}
window.window = window;
window.ace = window;

window.onerror = function(message, file, line, col, err) {
    postMessage({type: "error", data: {
        message: message,
        data: err.data,
        file: file,
        line: line, 
        col: col,
        stack: err.stack
    }});
};

window.normalizeModule = function(parentId, moduleName) {
    // normalize plugin requires
    if (moduleName.indexOf("!") !== -1) {
        var chunks = moduleName.split("!");
        return window.normalizeModule(parentId, chunks[0]) + "!" + window.normalizeModule(parentId, chunks[1]);
    }
    // normalize relative requires
    if (moduleName.charAt(0) == ".") {
        var base = parentId.split("/").slice(0, -1).join("/");
        moduleName = (base ? base + "/" : "") + moduleName;
        
        while (moduleName.indexOf(".") !== -1 && previous != moduleName) {
            var previous = moduleName;
            moduleName = moduleName.replace(/^\.\//, "").replace(/\/\.\//, "/").replace(/[^\/]+\/\.\.\//, "");
        }
    }
    
    return moduleName;
};

window.require = function require(parentId, id) {
    if (!id) {
        id = parentId;
        parentId = null;
    }
    if (!id.charAt)
        throw new Error("worker.js require() accepts only (parentId, id) as arguments");

    id = window.normalizeModule(parentId, id);

    var module = window.require.modules[id];
    if (module) {
        if (!module.initialized) {
            module.initialized = true;
            module.exports = module.factory().exports;
        }
        return module.exports;
    }
   
    if (!window.require.tlns)
        return console.log("unable to load " + id);
    
    var path = resolveModuleId(id, window.require.tlns);
    if (path.slice(-3) != ".js") path += ".js";
    
    window.require.id = id;
    window.require.modules[id] = {}; // prevent infinite loop on broken modules
    importScripts(path);
    return window.require(parentId, id);
};
function resolveModuleId(id, paths) {
    var testPath = id, tail = "";
    while (testPath) {
        var alias = paths[testPath];
        if (typeof alias == "string") {
            return alias + tail;
        } else if (alias) {
            return  alias.location.replace(/\/*$/, "/") + (tail || alias.main || alias.name);
        } else if (alias === false) {
            return "";
        }
        var i = testPath.lastIndexOf("/");
        if (i === -1) break;
        tail = testPath.substr(i) + tail;
        testPath = testPath.slice(0, i);
    }
    return id;
}
window.require.modules = {};
window.require.tlns = {};

window.define = function(id, deps, factory) {
    if (arguments.length == 2) {
        factory = deps;
        if (typeof id != "string") {
            deps = id;
            id = window.require.id;
        }
    } else if (arguments.length == 1) {
        factory = id;
        deps = [];
        id = window.require.id;
    }
    
    if (typeof factory != "function") {
        window.require.modules[id] = {
            exports: factory,
            initialized: true
        };
        return;
    }

    if (!deps.length)
        // If there is no dependencies, we inject "require", "exports" and
        // "module" as dependencies, to provide CommonJS compatibility.
        deps = ["require", "exports", "module"];

    var req = function(childId) {
        return window.require(id, childId);
    };

    window.require.modules[id] = {
        exports: {},
        factory: function() {
            var module = this;
            var returnExports = factory.apply(this, deps.map(function(dep) {
                switch (dep) {
                    // Because "require", "exports" and "module" aren't actual
                    // dependencies, we must handle them seperately.
                    case "require": return req;
                    case "exports": return module.exports;
                    case "module":  return module;
                    // But for all other dependencies, we can just go ahead and
                    // require them.
                    default:        return req(dep);
                }
            }));
            if (returnExports)
                module.exports = returnExports;
            return module;
        }
    };
};
window.define.amd = {};
require.tlns = {};
window.initBaseUrls  = function initBaseUrls(topLevelNamespaces) {
    for (var i in topLevelNamespaces)
        require.tlns[i] = topLevelNamespaces[i];
};

window.initSender = function initSender() {

    var EventEmitter = window.require("ace/lib/event_emitter").EventEmitter;
    var oop = window.require("ace/lib/oop");
    
    var Sender = function() {};
    
    (function() {
        
        oop.implement(this, EventEmitter);
                
        this.callback = function(data, callbackId) {
            postMessage({
                type: "call",
                id: callbackId,
                data: data
            });
        };
    
        this.emit = function(name, data) {
            postMessage({
                type: "event",
                name: name,
                data: data
            });
        };
        
    }).call(Sender.prototype);
    
    return new Sender();
};

var main = window.main = null;
var sender = window.sender = null;

window.onmessage = function(e) {
    var msg = e.data;
    if (msg.event && sender) {
        sender._signal(msg.event, msg.data);
    }
    else if (msg.command) {
        if (main[msg.command])
            main[msg.command].apply(main, msg.args);
        else if (window[msg.command])
            window[msg.command].apply(window, msg.args);
        else
            throw new Error("Unknown command:" + msg.command);
    }
    else if (msg.init) {
        window.initBaseUrls(msg.tlns);
        require("ace/lib/es5-shim");
        sender = window.sender = window.initSender();
        var clazz = require(msg.module)[msg.classname];
        main = window.main = new clazz(sender);
    }
};
})(this);

define("ace/lib/oop",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.inherits = function(ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
        }
    });
};

exports.mixin = function(obj, mixin) {
    for (var key in mixin) {
        obj[key] = mixin[key];
    }
    return obj;
};

exports.implement = function(proto, mixin) {
    exports.mixin(proto, mixin);
};

});

define("ace/range",["require","exports","module"], function(require, exports, module) {
"use strict";
var comparePoints = function(p1, p2) {
    return p1.row - p2.row || p1.column - p2.column;
};
var Range = function(startRow, startColumn, endRow, endColumn) {
    this.start = {
        row: startRow,
        column: startColumn
    };

    this.end = {
        row: endRow,
        column: endColumn
    };
};

(function() {
    this.isEqual = function(range) {
        return this.start.row === range.start.row &&
            this.end.row === range.end.row &&
            this.start.column === range.start.column &&
            this.end.column === range.end.column;
    };
    this.toString = function() {
        return ("Range: [" + this.start.row + "/" + this.start.column +
            "] -> [" + this.end.row + "/" + this.end.column + "]");
    };

    this.contains = function(row, column) {
        return this.compare(row, column) == 0;
    };
    this.compareRange = function(range) {
        var cmp,
            end = range.end,
            start = range.start;

        cmp = this.compare(end.row, end.column);
        if (cmp == 1) {
            cmp = this.compare(start.row, start.column);
            if (cmp == 1) {
                return 2;
            } else if (cmp == 0) {
                return 1;
            } else {
                return 0;
            }
        } else if (cmp == -1) {
            return -2;
        } else {
            cmp = this.compare(start.row, start.column);
            if (cmp == -1) {
                return -1;
            } else if (cmp == 1) {
                return 42;
            } else {
                return 0;
            }
        }
    };
    this.comparePoint = function(p) {
        return this.compare(p.row, p.column);
    };
    this.containsRange = function(range) {
        return this.comparePoint(range.start) == 0 && this.comparePoint(range.end) == 0;
    };
    this.intersects = function(range) {
        var cmp = this.compareRange(range);
        return (cmp == -1 || cmp == 0 || cmp == 1);
    };
    this.isEnd = function(row, column) {
        return this.end.row == row && this.end.column == column;
    };
    this.isStart = function(row, column) {
        return this.start.row == row && this.start.column == column;
    };
    this.setStart = function(row, column) {
        if (typeof row == "object") {
            this.start.column = row.column;
            this.start.row = row.row;
        } else {
            this.start.row = row;
            this.start.column = column;
        }
    };
    this.setEnd = function(row, column) {
        if (typeof row == "object") {
            this.end.column = row.column;
            this.end.row = row.row;
        } else {
            this.end.row = row;
            this.end.column = column;
        }
    };
    this.inside = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column) || this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.insideStart = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.insideEnd = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.compare = function(row, column) {
        if (!this.isMultiLine()) {
            if (row === this.start.row) {
                return column < this.start.column ? -1 : (column > this.end.column ? 1 : 0);
            }
        }

        if (row < this.start.row)
            return -1;

        if (row > this.end.row)
            return 1;

        if (this.start.row === row)
            return column >= this.start.column ? 0 : -1;

        if (this.end.row === row)
            return column <= this.end.column ? 0 : 1;

        return 0;
    };
    this.compareStart = function(row, column) {
        if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    };
    this.compareEnd = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else {
            return this.compare(row, column);
        }
    };
    this.compareInside = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    };
    this.clipRows = function(firstRow, lastRow) {
        if (this.end.row > lastRow)
            var end = {row: lastRow + 1, column: 0};
        else if (this.end.row < firstRow)
            var end = {row: firstRow, column: 0};

        if (this.start.row > lastRow)
            var start = {row: lastRow + 1, column: 0};
        else if (this.start.row < firstRow)
            var start = {row: firstRow, column: 0};

        return Range.fromPoints(start || this.start, end || this.end);
    };
    this.extend = function(row, column) {
        var cmp = this.compare(row, column);

        if (cmp == 0)
            return this;
        else if (cmp == -1)
            var start = {row: row, column: column};
        else
            var end = {row: row, column: column};

        return Range.fromPoints(start || this.start, end || this.end);
    };

    this.isEmpty = function() {
        return (this.start.row === this.end.row && this.start.column === this.end.column);
    };
    this.isMultiLine = function() {
        return (this.start.row !== this.end.row);
    };
    this.clone = function() {
        return Range.fromPoints(this.start, this.end);
    };
    this.collapseRows = function() {
        if (this.end.column == 0)
            return new Range(this.start.row, 0, Math.max(this.start.row, this.end.row-1), 0)
        else
            return new Range(this.start.row, 0, this.end.row, 0)
    };
    this.toScreenRange = function(session) {
        var screenPosStart = session.documentToScreenPosition(this.start);
        var screenPosEnd = session.documentToScreenPosition(this.end);

        return new Range(
            screenPosStart.row, screenPosStart.column,
            screenPosEnd.row, screenPosEnd.column
        );
    };
    this.moveBy = function(row, column) {
        this.start.row += row;
        this.start.column += column;
        this.end.row += row;
        this.end.column += column;
    };

}).call(Range.prototype);
Range.fromPoints = function(start, end) {
    return new Range(start.row, start.column, end.row, end.column);
};
Range.comparePoints = comparePoints;

Range.comparePoints = function(p1, p2) {
    return p1.row - p2.row || p1.column - p2.column;
};


exports.Range = Range;
});

define("ace/apply_delta",["require","exports","module"], function(require, exports, module) {
"use strict";

function throwDeltaError(delta, errorText){
    console.log("Invalid Delta:", delta);
    throw "Invalid Delta: " + errorText;
}

function positionInDocument(docLines, position) {
    return position.row    >= 0 && position.row    <  docLines.length &&
           position.column >= 0 && position.column <= docLines[position.row].length;
}

function validateDelta(docLines, delta) {
    if (delta.action != "insert" && delta.action != "remove")
        throwDeltaError(delta, "delta.action must be 'insert' or 'remove'");
    if (!(delta.lines instanceof Array))
        throwDeltaError(delta, "delta.lines must be an Array");
    if (!delta.start || !delta.end)
       throwDeltaError(delta, "delta.start/end must be an present");
    var start = delta.start;
    if (!positionInDocument(docLines, delta.start))
        throwDeltaError(delta, "delta.start must be contained in document");
    var end = delta.end;
    if (delta.action == "remove" && !positionInDocument(docLines, end))
        throwDeltaError(delta, "delta.end must contained in document for 'remove' actions");
    var numRangeRows = end.row - start.row;
    var numRangeLastLineChars = (end.column - (numRangeRows == 0 ? start.column : 0));
    if (numRangeRows != delta.lines.length - 1 || delta.lines[numRangeRows].length != numRangeLastLineChars)
        throwDeltaError(delta, "delta.range must match delta lines");
}

exports.applyDelta = function(docLines, delta, doNotValidate) {
    
    var row = delta.start.row;
    var startColumn = delta.start.column;
    var line = docLines[row] || "";
    switch (delta.action) {
        case "insert":
            var lines = delta.lines;
            if (lines.length === 1) {
                docLines[row] = line.substring(0, startColumn) + delta.lines[0] + line.substring(startColumn);
            } else {
                var args = [row, 1].concat(delta.lines);
                docLines.splice.apply(docLines, args);
                docLines[row] = line.substring(0, startColumn) + docLines[row];
                docLines[row + delta.lines.length - 1] += line.substring(startColumn);
            }
            break;
        case "remove":
            var endColumn = delta.end.column;
            var endRow = delta.end.row;
            if (row === endRow) {
                docLines[row] = line.substring(0, startColumn) + line.substring(endColumn);
            } else {
                docLines.splice(
                    row, endRow - row + 1,
                    line.substring(0, startColumn) + docLines[endRow].substring(endColumn)
                );
            }
            break;
    }
}
});

define("ace/lib/event_emitter",["require","exports","module"], function(require, exports, module) {
"use strict";

var EventEmitter = {};
var stopPropagation = function() { this.propagationStopped = true; };
var preventDefault = function() { this.defaultPrevented = true; };

EventEmitter._emit =
EventEmitter._dispatchEvent = function(eventName, e) {
    this._eventRegistry || (this._eventRegistry = {});
    this._defaultHandlers || (this._defaultHandlers = {});

    var listeners = this._eventRegistry[eventName] || [];
    var defaultHandler = this._defaultHandlers[eventName];
    if (!listeners.length && !defaultHandler)
        return;

    if (typeof e != "object" || !e)
        e = {};

    if (!e.type)
        e.type = eventName;
    if (!e.stopPropagation)
        e.stopPropagation = stopPropagation;
    if (!e.preventDefault)
        e.preventDefault = preventDefault;

    listeners = listeners.slice();
    for (var i=0; i<listeners.length; i++) {
        listeners[i](e, this);
        if (e.propagationStopped)
            break;
    }
    
    if (defaultHandler && !e.defaultPrevented)
        return defaultHandler(e, this);
};


EventEmitter._signal = function(eventName, e) {
    var listeners = (this._eventRegistry || {})[eventName];
    if (!listeners)
        return;
    listeners = listeners.slice();
    for (var i=0; i<listeners.length; i++)
        listeners[i](e, this);
};

EventEmitter.once = function(eventName, callback) {
    var _self = this;
    callback && this.addEventListener(eventName, function newCallback() {
        _self.removeEventListener(eventName, newCallback);
        callback.apply(null, arguments);
    });
};


EventEmitter.setDefaultHandler = function(eventName, callback) {
    var handlers = this._defaultHandlers
    if (!handlers)
        handlers = this._defaultHandlers = {_disabled_: {}};
    
    if (handlers[eventName]) {
        var old = handlers[eventName];
        var disabled = handlers._disabled_[eventName];
        if (!disabled)
            handlers._disabled_[eventName] = disabled = [];
        disabled.push(old);
        var i = disabled.indexOf(callback);
        if (i != -1) 
            disabled.splice(i, 1);
    }
    handlers[eventName] = callback;
};
EventEmitter.removeDefaultHandler = function(eventName, callback) {
    var handlers = this._defaultHandlers
    if (!handlers)
        return;
    var disabled = handlers._disabled_[eventName];
    
    if (handlers[eventName] == callback) {
        var old = handlers[eventName];
        if (disabled)
            this.setDefaultHandler(eventName, disabled.pop());
    } else if (disabled) {
        var i = disabled.indexOf(callback);
        if (i != -1)
            disabled.splice(i, 1);
    }
};

EventEmitter.on =
EventEmitter.addEventListener = function(eventName, callback, capturing) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        listeners = this._eventRegistry[eventName] = [];

    if (listeners.indexOf(callback) == -1)
        listeners[capturing ? "unshift" : "push"](callback);
    return callback;
};

EventEmitter.off =
EventEmitter.removeListener =
EventEmitter.removeEventListener = function(eventName, callback) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        return;

    var index = listeners.indexOf(callback);
    if (index !== -1)
        listeners.splice(index, 1);
};

EventEmitter.removeAllListeners = function(eventName) {
    if (this._eventRegistry) this._eventRegistry[eventName] = [];
};

exports.EventEmitter = EventEmitter;

});

define("ace/anchor",["require","exports","module","ace/lib/oop","ace/lib/event_emitter"], function(require, exports, module) {
"use strict";

var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;

var Anchor = exports.Anchor = function(doc, row, column) {
    this.$onChange = this.onChange.bind(this);
    this.attach(doc);
    
    if (typeof column == "undefined")
        this.setPosition(row.row, row.column);
    else
        this.setPosition(row, column);
};

(function() {

    oop.implement(this, EventEmitter);
    this.getPosition = function() {
        return this.$clipPositionToDocument(this.row, this.column);
    };
    this.getDocument = function() {
        return this.document;
    };
    this.$insertRight = false;
    this.onChange = function(delta) {
        if (delta.start.row == delta.end.row && delta.start.row != this.row)
            return;

        if (delta.start.row > this.row)
            return;
            
        var point = $getTransformedPoint(delta, {row: this.row, column: this.column}, this.$insertRight);
        this.setPosition(point.row, point.column, true);
    };
    
    function $pointsInOrder(point1, point2, equalPointsInOrder) {
        var bColIsAfter = equalPointsInOrder ? point1.column <= point2.column : point1.column < point2.column;
        return (point1.row < point2.row) || (point1.row == point2.row && bColIsAfter);
    }
            
    function $getTransformedPoint(delta, point, moveIfEqual) {
        var deltaIsInsert = delta.action == "insert";
        var deltaRowShift = (deltaIsInsert ? 1 : -1) * (delta.end.row    - delta.start.row);
        var deltaColShift = (deltaIsInsert ? 1 : -1) * (delta.end.column - delta.start.column);
        var deltaStart = delta.start;
        var deltaEnd = deltaIsInsert ? deltaStart : delta.end; // Collapse insert range.
        if ($pointsInOrder(point, deltaStart, moveIfEqual)) {
            return {
                row: point.row,
                column: point.column
            };
        }
        if ($pointsInOrder(deltaEnd, point, !moveIfEqual)) {
            return {
                row: point.row + deltaRowShift,
                column: point.column + (point.row == deltaEnd.row ? deltaColShift : 0)
            };
        }
        
        return {
            row: deltaStart.row,
            column: deltaStart.column
        };
    }
    this.setPosition = function(row, column, noClip) {
        var pos;
        if (noClip) {
            pos = {
                row: row,
                column: column
            };
        } else {
            pos = this.$clipPositionToDocument(row, column);
        }

        if (this.row == pos.row && this.column == pos.column)
            return;

        var old = {
            row: this.row,
            column: this.column
        };

        this.row = pos.row;
        this.column = pos.column;
        this._signal("change", {
            old: old,
            value: pos
        });
    };
    this.detach = function() {
        this.document.removeEventListener("change", this.$onChange);
    };
    this.attach = function(doc) {
        this.document = doc || this.document;
        this.document.on("change", this.$onChange);
    };
    this.$clipPositionToDocument = function(row, column) {
        var pos = {};

        if (row >= this.document.getLength()) {
            pos.row = Math.max(0, this.document.getLength() - 1);
            pos.column = this.document.getLine(pos.row).length;
        }
        else if (row < 0) {
            pos.row = 0;
            pos.column = 0;
        }
        else {
            pos.row = row;
            pos.column = Math.min(this.document.getLine(pos.row).length, Math.max(0, column));
        }

        if (column < 0)
            pos.column = 0;

        return pos;
    };

}).call(Anchor.prototype);

});

define("ace/document",["require","exports","module","ace/lib/oop","ace/apply_delta","ace/lib/event_emitter","ace/range","ace/anchor"], function(require, exports, module) {
"use strict";

var oop = require("./lib/oop");
var applyDelta = require("./apply_delta").applyDelta;
var EventEmitter = require("./lib/event_emitter").EventEmitter;
var Range = require("./range").Range;
var Anchor = require("./anchor").Anchor;

var Document = function(textOrLines) {
    this.$lines = [""];
    if (textOrLines.length === 0) {
        this.$lines = [""];
    } else if (Array.isArray(textOrLines)) {
        this.insertMergedLines({row: 0, column: 0}, textOrLines);
    } else {
        this.insert({row: 0, column:0}, textOrLines);
    }
};

(function() {

    oop.implement(this, EventEmitter);
    this.setValue = function(text) {
        var len = this.getLength() - 1;
        this.remove(new Range(0, 0, len, this.getLine(len).length));
        this.insert({row: 0, column: 0}, text);
    };
    this.getValue = function() {
        return this.getAllLines().join(this.getNewLineCharacter());
    };
    this.createAnchor = function(row, column) {
        return new Anchor(this, row, column);
    };
    if ("aaa".split(/a/).length === 0) {
        this.$split = function(text) {
            return text.replace(/\r\n|\r/g, "\n").split("\n");
        };
    } else {
        this.$split = function(text) {
            return text.split(/\r\n|\r|\n/);
        };
    }


    this.$detectNewLine = function(text) {
        var match = text.match(/^.*?(\r\n|\r|\n)/m);
        this.$autoNewLine = match ? match[1] : "\n";
        this._signal("changeNewLineMode");
    };
    this.getNewLineCharacter = function() {
        switch (this.$newLineMode) {
          case "windows":
            return "\r\n";
          case "unix":
            return "\n";
          default:
            return this.$autoNewLine || "\n";
        }
    };

    this.$autoNewLine = "";
    this.$newLineMode = "auto";
    this.setNewLineMode = function(newLineMode) {
        if (this.$newLineMode === newLineMode)
            return;

        this.$newLineMode = newLineMode;
        this._signal("changeNewLineMode");
    };
    this.getNewLineMode = function() {
        return this.$newLineMode;
    };
    this.isNewLine = function(text) {
        return (text == "\r\n" || text == "\r" || text == "\n");
    };
    this.getLine = function(row) {
        return this.$lines[row] || "";
    };
    this.getLines = function(firstRow, lastRow) {
        return this.$lines.slice(firstRow, lastRow + 1);
    };
    this.getAllLines = function() {
        return this.getLines(0, this.getLength());
    };
    this.getLength = function() {
        return this.$lines.length;
    };
    this.getTextRange = function(range) {
        return this.getLinesForRange(range).join(this.getNewLineCharacter());
    };
    this.getLinesForRange = function(range) {
        var lines;
        if (range.start.row === range.end.row) {
            lines = [this.getLine(range.start.row).substring(range.start.column, range.end.column)];
        } else {
            lines = this.getLines(range.start.row, range.end.row);
            lines[0] = (lines[0] || "").substring(range.start.column);
            var l = lines.length - 1;
            if (range.end.row - range.start.row == l)
                lines[l] = lines[l].substring(0, range.end.column);
        }
        return lines;
    };
    this.insertLines = function(row, lines) {
        console.warn("Use of document.insertLines is deprecated. Use the insertFullLines method instead.");
        return this.insertFullLines(row, lines);
    };
    this.removeLines = function(firstRow, lastRow) {
        console.warn("Use of document.removeLines is deprecated. Use the removeFullLines method instead.");
        return this.removeFullLines(firstRow, lastRow);
    };
    this.insertNewLine = function(position) {
        console.warn("Use of document.insertNewLine is deprecated. Use insertMergedLines(position, ['', '']) instead.");
        return this.insertMergedLines(position, ["", ""]);
    };
    this.insert = function(position, text) {
        if (this.getLength() <= 1)
            this.$detectNewLine(text);
        
        return this.insertMergedLines(position, this.$split(text));
    };
    this.insertInLine = function(position, text) {
        var start = this.clippedPos(position.row, position.column);
        var end = this.pos(position.row, position.column + text.length);
        
        this.applyDelta({
            start: start,
            end: end,
            action: "insert",
            lines: [text]
        }, true);
        
        return this.clonePos(end);
    };
    
    this.clippedPos = function(row, column) {
        var length = this.getLength();
        if (row === undefined) {
            row = length;
        } else if (row < 0) {
            row = 0;
        } else if (row >= length) {
            row = length - 1;
            column = undefined;
        }
        var line = this.getLine(row);
        if (column == undefined)
            column = line.length;
        column = Math.min(Math.max(column, 0), line.length);
        return {row: row, column: column};
    };
    
    this.clonePos = function(pos) {
        return {row: pos.row, column: pos.column};
    };
    
    this.pos = function(row, column) {
        return {row: row, column: column};
    };
    
    this.$clipPosition = function(position) {
        var length = this.getLength();
        if (position.row >= length) {
            position.row = Math.max(0, length - 1);
            position.column = this.getLine(length - 1).length;
        } else {
            position.row = Math.max(0, position.row);
            position.column = Math.min(Math.max(position.column, 0), this.getLine(position.row).length);
        }
        return position;
    };
    this.insertFullLines = function(row, lines) {
        row = Math.min(Math.max(row, 0), this.getLength());
        var column = 0;
        if (row < this.getLength()) {
            lines = lines.concat([""]);
            column = 0;
        } else {
            lines = [""].concat(lines);
            row--;
            column = this.$lines[row].length;
        }
        this.insertMergedLines({row: row, column: column}, lines);
    };    
    this.insertMergedLines = function(position, lines) {
        var start = this.clippedPos(position.row, position.column);
        var end = {
            row: start.row + lines.length - 1,
            column: (lines.length == 1 ? start.column : 0) + lines[lines.length - 1].length
        };
        
        this.applyDelta({
            start: start,
            end: end,
            action: "insert",
            lines: lines
        });
        
        return this.clonePos(end);
    };
    this.remove = function(range) {
        var start = this.clippedPos(range.start.row, range.start.column);
        var end = this.clippedPos(range.end.row, range.end.column);
        this.applyDelta({
            start: start,
            end: end,
            action: "remove",
            lines: this.getLinesForRange({start: start, end: end})
        });
        return this.clonePos(start);
    };
    this.removeInLine = function(row, startColumn, endColumn) {
        var start = this.clippedPos(row, startColumn);
        var end = this.clippedPos(row, endColumn);
        
        this.applyDelta({
            start: start,
            end: end,
            action: "remove",
            lines: this.getLinesForRange({start: start, end: end})
        }, true);
        
        return this.clonePos(start);
    };
    this.removeFullLines = function(firstRow, lastRow) {
        firstRow = Math.min(Math.max(0, firstRow), this.getLength() - 1);
        lastRow  = Math.min(Math.max(0, lastRow ), this.getLength() - 1);
        var deleteFirstNewLine = lastRow == this.getLength() - 1 && firstRow > 0;
        var deleteLastNewLine  = lastRow  < this.getLength() - 1;
        var startRow = ( deleteFirstNewLine ? firstRow - 1                  : firstRow                    );
        var startCol = ( deleteFirstNewLine ? this.getLine(startRow).length : 0                           );
        var endRow   = ( deleteLastNewLine  ? lastRow + 1                   : lastRow                     );
        var endCol   = ( deleteLastNewLine  ? 0                             : this.getLine(endRow).length ); 
        var range = new Range(startRow, startCol, endRow, endCol);
        var deletedLines = this.$lines.slice(firstRow, lastRow + 1);
        
        this.applyDelta({
            start: range.start,
            end: range.end,
            action: "remove",
            lines: this.getLinesForRange(range)
        });
        return deletedLines;
    };
    this.removeNewLine = function(row) {
        if (row < this.getLength() - 1 && row >= 0) {
            this.applyDelta({
                start: this.pos(row, this.getLine(row).length),
                end: this.pos(row + 1, 0),
                action: "remove",
                lines: ["", ""]
            });
        }
    };
    this.replace = function(range, text) {
        if (!(range instanceof Range))
            range = Range.fromPoints(range.start, range.end);
        if (text.length === 0 && range.isEmpty())
            return range.start;
        if (text == this.getTextRange(range))
            return range.end;

        this.remove(range);
        var end;
        if (text) {
            end = this.insert(range.start, text);
        }
        else {
            end = range.start;
        }
        
        return end;
    };
    this.applyDeltas = function(deltas) {
        for (var i=0; i<deltas.length; i++) {
            this.applyDelta(deltas[i]);
        }
    };
    this.revertDeltas = function(deltas) {
        for (var i=deltas.length-1; i>=0; i--) {
            this.revertDelta(deltas[i]);
        }
    };
    this.applyDelta = function(delta, doNotValidate) {
        var isInsert = delta.action == "insert";
        if (isInsert ? delta.lines.length <= 1 && !delta.lines[0]
            : !Range.comparePoints(delta.start, delta.end)) {
            return;
        }
        
        if (isInsert && delta.lines.length > 20000)
            this.$splitAndapplyLargeDelta(delta, 20000);
        applyDelta(this.$lines, delta, doNotValidate);
        this._signal("change", delta);
    };
    
    this.$splitAndapplyLargeDelta = function(delta, MAX) {
        var lines = delta.lines;
        var l = lines.length;
        var row = delta.start.row; 
        var column = delta.start.column;
        var from = 0, to = 0;
        do {
            from = to;
            to += MAX - 1;
            var chunk = lines.slice(from, to);
            if (to > l) {
                delta.lines = chunk;
                delta.start.row = row + from;
                delta.start.column = column;
                break;
            }
            chunk.push("");
            this.applyDelta({
                start: this.pos(row + from, column),
                end: this.pos(row + to, column = 0),
                action: delta.action,
                lines: chunk
            }, true);
        } while(true);
    };
    this.revertDelta = function(delta) {
        this.applyDelta({
            start: this.clonePos(delta.start),
            end: this.clonePos(delta.end),
            action: (delta.action == "insert" ? "remove" : "insert"),
            lines: delta.lines.slice()
        });
    };
    this.indexToPosition = function(index, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        for (var i = startRow || 0, l = lines.length; i < l; i++) {
            index -= lines[i].length + newlineLength;
            if (index < 0)
                return {row: i, column: index + lines[i].length + newlineLength};
        }
        return {row: l-1, column: lines[l-1].length};
    };
    this.positionToIndex = function(pos, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        var index = 0;
        var row = Math.min(pos.row, lines.length);
        for (var i = startRow || 0; i < row; ++i)
            index += lines[i].length + newlineLength;

        return index + pos.column;
    };

}).call(Document.prototype);

exports.Document = Document;
});

define("ace/lib/lang",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.last = function(a) {
    return a[a.length - 1];
};

exports.stringReverse = function(string) {
    return string.split("").reverse().join("");
};

exports.stringRepeat = function (string, count) {
    var result = '';
    while (count > 0) {
        if (count & 1)
            result += string;

        if (count >>= 1)
            string += string;
    }
    return result;
};

var trimBeginRegexp = /^\s\s*/;
var trimEndRegexp = /\s\s*$/;

exports.stringTrimLeft = function (string) {
    return string.replace(trimBeginRegexp, '');
};

exports.stringTrimRight = function (string) {
    return string.replace(trimEndRegexp, '');
};

exports.copyObject = function(obj) {
    var copy = {};
    for (var key in obj) {
        copy[key] = obj[key];
    }
    return copy;
};

exports.copyArray = function(array){
    var copy = [];
    for (var i=0, l=array.length; i<l; i++) {
        if (array[i] && typeof array[i] == "object")
            copy[i] = this.copyObject(array[i]);
        else 
            copy[i] = array[i];
    }
    return copy;
};

exports.deepCopy = function deepCopy(obj) {
    if (typeof obj !== "object" || !obj)
        return obj;
    var copy;
    if (Array.isArray(obj)) {
        copy = [];
        for (var key = 0; key < obj.length; key++) {
            copy[key] = deepCopy(obj[key]);
        }
        return copy;
    }
    if (Object.prototype.toString.call(obj) !== "[object Object]")
        return obj;
    
    copy = {};
    for (var key in obj)
        copy[key] = deepCopy(obj[key]);
    return copy;
};

exports.arrayToMap = function(arr) {
    var map = {};
    for (var i=0; i<arr.length; i++) {
        map[arr[i]] = 1;
    }
    return map;

};

exports.createMap = function(props) {
    var map = Object.create(null);
    for (var i in props) {
        map[i] = props[i];
    }
    return map;
};
exports.arrayRemove = function(array, value) {
  for (var i = 0; i <= array.length; i++) {
    if (value === array[i]) {
      array.splice(i, 1);
    }
  }
};

exports.escapeRegExp = function(str) {
    return str.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
};

exports.escapeHTML = function(str) {
    return str.replace(/&/g, "&#38;").replace(/"/g, "&#34;").replace(/'/g, "&#39;").replace(/</g, "&#60;");
};

exports.getMatchOffsets = function(string, regExp) {
    var matches = [];

    string.replace(regExp, function(str) {
        matches.push({
            offset: arguments[arguments.length-2],
            length: str.length
        });
    });

    return matches;
};
exports.deferredCall = function(fcn) {
    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var deferred = function(timeout) {
        deferred.cancel();
        timer = setTimeout(callback, timeout || 0);
        return deferred;
    };

    deferred.schedule = deferred;

    deferred.call = function() {
        this.cancel();
        fcn();
        return deferred;
    };

    deferred.cancel = function() {
        clearTimeout(timer);
        timer = null;
        return deferred;
    };
    
    deferred.isPending = function() {
        return timer;
    };

    return deferred;
};


exports.delayedCall = function(fcn, defaultTimeout) {
    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var _self = function(timeout) {
        if (timer == null)
            timer = setTimeout(callback, timeout || defaultTimeout);
    };

    _self.delay = function(timeout) {
        timer && clearTimeout(timer);
        timer = setTimeout(callback, timeout || defaultTimeout);
    };
    _self.schedule = _self;

    _self.call = function() {
        this.cancel();
        fcn();
    };

    _self.cancel = function() {
        timer && clearTimeout(timer);
        timer = null;
    };

    _self.isPending = function() {
        return timer;
    };

    return _self;
};
});

define("ace/worker/mirror",["require","exports","module","ace/range","ace/document","ace/lib/lang"], function(require, exports, module) {
"use strict";

var Range = require("../range").Range;
var Document = require("../document").Document;
var lang = require("../lib/lang");
    
var Mirror = exports.Mirror = function(sender) {
    this.sender = sender;
    var doc = this.doc = new Document("");
    
    var deferredUpdate = this.deferredUpdate = lang.delayedCall(this.onUpdate.bind(this));
    
    var _self = this;
    sender.on("change", function(e) {
        var data = e.data;
        if (data[0].start) {
            doc.applyDeltas(data);
        } else {
            for (var i = 0; i < data.length; i += 2) {
                if (Array.isArray(data[i+1])) {
                    var d = {action: "insert", start: data[i], lines: data[i+1]};
                } else {
                    var d = {action: "remove", start: data[i], end: data[i+1]};
                }
                doc.applyDelta(d, true);
            }
        }
        if (_self.$timeout)
            return deferredUpdate.schedule(_self.$timeout);
        _self.onUpdate();
    });
};

(function() {
    
    this.$timeout = 500;
    
    this.setTimeout = function(timeout) {
        this.$timeout = timeout;
    };
    
    this.setValue = function(value) {
        this.doc.setValue(value);
        this.deferredUpdate.schedule(this.$timeout);
    };
    
    this.getValue = function(callbackId) {
        this.sender.callback(this.doc.getValue(), callbackId);
    };
    
    this.onUpdate = function() {
    };
    
    this.isPending = function() {
        return this.deferredUpdate.isPending();
    };
    
}).call(Mirror.prototype);

});

define("ace/mode/gherkin/lib/gherkin/errors",["require","exports","module"], function (require, exports, module) {
    var Errors = {};

    [
      'ParserException',
      'CompositeParserException',
      'UnexpectedTokenException',
      'UnexpectedEOFException',
      'AstBuilderException',
      'NoSuchLanguageException'
    ].forEach(function (name) {

      function ErrorProto (message) {
        this.message = message || ('Unspecified ' + name);
        if (Error.captureStackTrace) {
          Error.captureStackTrace(this, arguments.callee);
        }
      }

      ErrorProto.prototype = Object.create(Error.prototype);
      ErrorProto.prototype.name = name;
      ErrorProto.prototype.constructor = ErrorProto;
      Errors[name] = ErrorProto;
    });

    Errors.CompositeParserException.create = function(errors) {
      var message = "Parser errors:\n" + errors.map(function (e) { return e.message; }).join("\n");
      var err = new Errors.CompositeParserException(message);
      err.errors = errors;
      return err;
    };

    Errors.UnexpectedTokenException.create = function(token, expectedTokenTypes, stateComment) {
      var message = "expected: " + expectedTokenTypes.join(', ') + ", got '" + token.getTokenValue().trim() + "'";
      var location = !token.location.column
        ? {line: token.location.line, column: token.line.indent + 1 }
        : token.location;
      return createError(Errors.UnexpectedEOFException, message, location);
    };

    Errors.UnexpectedEOFException.create = function(token, expectedTokenTypes, stateComment) {
      var message = "unexpected end of file, expected: " + expectedTokenTypes.join(', ');
      return createError(Errors.UnexpectedTokenException, message, token.location);
    };

    Errors.AstBuilderException.create = function(message, location) {
      return createError(Errors.AstBuilderException, message, location);
    };

    Errors.NoSuchLanguageException.create = function(language, location) {
      var message = "Language not supported: " + language;
      return createError(Errors.NoSuchLanguageException, message, location);
    };

    function createError(Ctor, message, location) {
      var fullMessage = "(" + location.line + ":" + location.column + "): " + message;
      var error = new Ctor(fullMessage);
      error.location = location;
      return error;
    }

    module.exports = Errors;
});

define("ace/mode/gherkin/lib/gherkin/ast_node",["require","exports","module"], function (require, exports, module) {
    function AstNode (ruleType) {
      this.ruleType = ruleType;
      this._subItems = {};
    }

    AstNode.prototype.add = function (ruleType, obj) {
      var items = this._subItems[ruleType];
      if(items === undefined) this._subItems[ruleType] = items = [];
      items.push(obj);
    }

    AstNode.prototype.getSingle = function (ruleType) {
      return (this._subItems[ruleType] || [])[0];
    }

    AstNode.prototype.getItems = function (ruleType) {
      return this._subItems[ruleType] || [];
    }

    AstNode.prototype.getToken = function (tokenType) {
      return this.getSingle(tokenType);
    }

    AstNode.prototype.getTokens = function (tokenType) {
      return this._subItems[tokenType] || [];
    }

    module.exports = AstNode;
});

define("ace/mode/gherkin/lib/gherkin/ast_builder",["require","exports","module","ace/mode/gherkin/lib/gherkin/ast_node","ace/mode/gherkin/lib/gherkin/errors"], function (require, exports, module) {
    var AstNode = require('./ast_node');
    var Errors = require('./errors');

    module.exports = function AstBuilder () {

      var stack = [new AstNode('None')];
      var comments = [];

      this.reset = function () {
        stack = [new AstNode('None')];
        comments = [];
      };

      this.startRule = function (ruleType) {
        stack.push(new AstNode(ruleType));
      };

      this.endRule = function (ruleType) {
        var node = stack.pop();
        var transformedNode = transformNode(node);
        currentNode().add(node.ruleType, transformedNode);
      };

      this.build = function (token) {
        if(token.matchedType === 'Comment') {
          comments.push({
            type: 'Comment',
            location: getLocation(token),
            text: token.matchedText
          });
        } else {
          currentNode().add(token.matchedType, token);
        }
      };

      this.getResult = function () {
        return currentNode().getSingle('GherkinDocument');
      };

      function currentNode () {
        return stack[stack.length - 1];
      }

      function getLocation (token, column) {
        return !column ? token.location : {line: token.location.line, column: column};
      }

      function getTags (node) {
        var tags = [];
        var tagsNode = node.getSingle('Tags');
        if (!tagsNode) return tags;
        tagsNode.getTokens('TagLine').forEach(function (token) {
          token.matchedItems.forEach(function (tagItem) {
            tags.push({
              type: 'Tag',
              location: getLocation(token, tagItem.column),
              name: tagItem.text
            });
          });

        });
        return tags;
      }

      function getCells(tableRowToken) {
        return tableRowToken.matchedItems.map(function (cellItem) {
          return {
            type: 'TableCell',
            location: getLocation(tableRowToken, cellItem.column),
            value: cellItem.text
          }
        });
      }

      function getDescription (node) {
        return node.getSingle('Description');
      }

      function getSteps (node) {
        return node.getItems('Step');
      }

      function getTableRows(node) {
        var rows = node.getTokens('TableRow').map(function (token) {
          return {
            type: 'TableRow',
            location: getLocation(token),
            cells: getCells(token)
          };
        });
        ensureCellCount(rows);
        return rows;
      }

      function ensureCellCount(rows) {
        if(rows.length == 0) return;
        var cellCount = rows[0].cells.length;

        rows.forEach(function (row) {
          if (row.cells.length != cellCount) {
            throw Errors.AstBuilderException.create("inconsistent cell count within the table", row.location);
          }
        });
      }

      function transformNode(node) {
        switch(node.ruleType) {
          case 'Step':
            var stepLine = node.getToken('StepLine');
            var stepArgument = node.getSingle('DataTable') || node.getSingle('DocString') || undefined;

            return {
              type: node.ruleType,
              location: getLocation(stepLine),
              keyword: stepLine.matchedKeyword,
              text: stepLine.matchedText,
              argument: stepArgument
            }
          case 'DocString':
            var separatorToken = node.getTokens('DocStringSeparator')[0];
            var contentType = separatorToken.matchedText.length > 0 ? separatorToken.matchedText : undefined;
            var lineTokens = node.getTokens('Other');
            var content = lineTokens.map(function (t) {return t.matchedText}).join("\n");

            var result = {
              type: node.ruleType,
              location: getLocation(separatorToken),
              content: content
            };
            if(contentType) {
              result.contentType = contentType;
            }
            return result;
          case 'DataTable':
            var rows = getTableRows(node);
            return {
              type: node.ruleType,
              location: rows[0].location,
              rows: rows,
            }
          case 'Background':
            var backgroundLine = node.getToken('BackgroundLine');
            var description = getDescription(node);
            var steps = getSteps(node);

            return {
              type: node.ruleType,
              location: getLocation(backgroundLine),
              keyword: backgroundLine.matchedKeyword,
              name: backgroundLine.matchedText,
              description: description,
              steps: steps
            };
          case 'Scenario_Definition':
            var tags = getTags(node);
            var scenarioNode = node.getSingle('Scenario');
            if(scenarioNode) {
              var scenarioLine = scenarioNode.getToken('ScenarioLine');
              var description = getDescription(scenarioNode);
              var steps = getSteps(scenarioNode);

              return {
                type: scenarioNode.ruleType,
                tags: tags,
                location: getLocation(scenarioLine),
                keyword: scenarioLine.matchedKeyword,
                name: scenarioLine.matchedText,
                description: description,
                steps: steps
              };
            } else {
              var scenarioOutlineNode = node.getSingle('ScenarioOutline');
              if(!scenarioOutlineNode) throw new Error('Internal grammar error');

              var scenarioOutlineLine = scenarioOutlineNode.getToken('ScenarioOutlineLine');
              var description = getDescription(scenarioOutlineNode);
              var steps = getSteps(scenarioOutlineNode);
              var examples = scenarioOutlineNode.getItems('Examples_Definition');

              return {
                type: scenarioOutlineNode.ruleType,
                tags: tags,
                location: getLocation(scenarioOutlineLine),
                keyword: scenarioOutlineLine.matchedKeyword,
                name: scenarioOutlineLine.matchedText,
                description: description,
                steps: steps,
                examples: examples
              };
            }
          case 'Examples_Definition':
            var tags = getTags(node);
            var examplesNode = node.getSingle('Examples');
            var examplesLine = examplesNode.getToken('ExamplesLine');
            var description = getDescription(examplesNode);
            var exampleTable = examplesNode.getSingle('Examples_Table')

            return {
              type: examplesNode.ruleType,
              tags: tags,
              location: getLocation(examplesLine),
              keyword: examplesLine.matchedKeyword,
              name: examplesLine.matchedText,
              description: description,
              tableHeader: exampleTable != undefined ? exampleTable.tableHeader : undefined,
              tableBody: exampleTable != undefined ? exampleTable.tableBody : undefined
            };
          case 'Examples_Table':
            var rows = getTableRows(node)

            return {
              tableHeader: rows != undefined ? rows[0] : undefined,
              tableBody: rows != undefined ? rows.slice(1) : undefined
            };
          case 'Description':
            var lineTokens = node.getTokens('Other');
            var end = lineTokens.length;
            while (end > 0 && lineTokens[end-1].line.trimmedLineText === '') {
                end--;
            }
            lineTokens = lineTokens.slice(0, end);

            var description = lineTokens.map(function (token) { return token.matchedText}).join("\n");
            return description;

          case 'Feature':
            var header = node.getSingle('Feature_Header');
            if(!header) return null;
            var tags = getTags(header);
            var featureLine = header.getToken('FeatureLine');
            if(!featureLine) return null;
            var children = []
            var background = node.getSingle('Background');
            if(background) children.push(background);
            children = children.concat(node.getItems('Scenario_Definition'));
            var description = getDescription(header);
            var language = featureLine.matchedGherkinDialect;

            return {
              type: node.ruleType,
              tags: tags,
              location: getLocation(featureLine),
              language: language,
              keyword: featureLine.matchedKeyword,
              name: featureLine.matchedText,
              description: description,
              children: children,
            };
          case 'GherkinDocument':
            var feature = node.getSingle('Feature');

            return {
              type: node.ruleType,
              feature: feature,
              comments: comments
            };
          default:
            return node;
        }
      }

    };
});

define("ace/mode/gherkin/lib/gherkin/token",["require","exports","module"], function (require, exports, module) {
    function Token(line, location) {
      this.line = line;
      this.location = location;
      this.isEof = line == null;
    };

    Token.prototype.getTokenValue = function () {
      return this.isEof ? "EOF" : this.line.getLineText(-1);
    };

    Token.prototype.detach = function () {
    };

    module.exports = Token;
});

define("ace/mode/gherkin/lib/gherkin/count_symbols",["require","exports","module"], function (require, exports, module) {
    var regexAstralSymbols = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

    module.exports = function countSymbols(string) {
      return string.replace(regexAstralSymbols, '_').length;
    }
});

define("ace/mode/gherkin/lib/gherkin/gherkin_line",["require","exports","module","ace/mode/gherkin/lib/gherkin/count_symbols"], function (require, exports, module) {
    var countSymbols = require('./count_symbols')

    function GherkinLine(lineText, lineNumber) {
      this.lineText = lineText;
      this.lineNumber = lineNumber;
      this.trimmedLineText = lineText.replace(/^\s+/g, ''); // ltrim
      this.isEmpty = this.trimmedLineText.length == 0;
      this.indent = countSymbols(lineText) - countSymbols(this.trimmedLineText);
    };

    GherkinLine.prototype.startsWith = function startsWith(prefix) {
      return this.trimmedLineText.indexOf(prefix) == 0;
    };

    GherkinLine.prototype.startsWithTitleKeyword = function startsWithTitleKeyword(keyword) {
      return this.startsWith(keyword+':'); // The C# impl is more complicated. Find out why.
    };

    GherkinLine.prototype.getLineText = function getLineText(indentToRemove) {
      if (indentToRemove < 0 || indentToRemove > this.indent) {
        return this.trimmedLineText;
      } else {
        return this.lineText.substring(indentToRemove);
      }
    };

    GherkinLine.prototype.getRestTrimmed = function getRestTrimmed(length) {
      return this.trimmedLineText.substring(length).trim();
    };

    GherkinLine.prototype.getTableCells = function getTableCells() {
      var cells = [];
      var col = 0;
      var startCol = col + 1;
      var cell = '';
      var firstCell = true;
      while (col < this.trimmedLineText.length) {
        var chr = this.trimmedLineText[col];
        col++;

        if (chr == '|') {
          if (firstCell) {
            firstCell = false;
          } else {
            var cellIndent = cell.length - cell.replace(/^\s+/g, '').length;
            var span = {column: this.indent + startCol + cellIndent, text: cell.trim()};
            cells.push(span);
          }
          cell = '';
          startCol = col + 1;
        } else if (chr == '\\') {
          chr = this.trimmedLineText[col];
          col += 1;
          if (chr == 'n') {
            cell += '\n';
          } else {
            if (chr != '|' && chr != '\\') {
              cell += '\\';
            }
            cell += chr;
          }
        } else {
          cell += chr;
        }
      }

      return cells;
    };

    GherkinLine.prototype.getTags = function getTags() {
      var column = this.indent + 1;
      var items = this.trimmedLineText.trim().split('@');
      items.shift();
      return items.map(function (item) {
        var length = item.length;
        var span = {column: column, text: '@' + item.trim()};
        column += length + 1;
        return span;
      });
    };

    module.exports = GherkinLine;
});

define("ace/mode/gherkin/lib/gherkin/token_scanner",["require","exports","module","ace/mode/gherkin/lib/gherkin/token","ace/mode/gherkin/lib/gherkin/gherkin_line"], function (require, exports, module) {
    var Token = require('./token');
    var GherkinLine = require('./gherkin_line');
    module.exports = function TokenScanner(source) {
      var lines = source.split(/\r?\n/);
      if(lines.length > 0 && lines[lines.length-1].trim() == '') {
        lines.pop();
      }
      var lineNumber = 0;

      this.read = function () {
        var line = lines[lineNumber++];
        var location = {line: lineNumber, column: 0};
        return line == null ? new Token(null, location) : new Token(new GherkinLine(line, lineNumber), location);
      }
    };
});

define("ace/mode/gherkin/lib/gherkin/dialects",["require","exports","module"], function (require, exports, module) {
    module.exports = {
      "af": {
        "and": [
          "* ",
          "En "
        ],
        "background": [
          "Agtergrond"
        ],
        "but": [
          "* ",
          "Maar "
        ],
        "examples": [
          "Voorbeelde"
        ],
        "feature": [
          "Funksie",
          "Besigheid Behoefte",
          "Vermoë"
        ],
        "given": [
          "* ",
          "Gegewe "
        ],
        "name": "Afrikaans",
        "native": "Afrikaans",
        "scenario": [
          "Situasie"
        ],
        "scenarioOutline": [
          "Situasie Uiteensetting"
        ],
        "then": [
          "* ",
          "Dan "
        ],
        "when": [
          "* ",
          "Wanneer "
        ]
      },
      "am": {
        "and": [
          "* ",
          "Եվ "
        ],
        "background": [
          "Կոնտեքստ"
        ],
        "but": [
          "* ",
          "Բայց "
        ],
        "examples": [
          "Օրինակներ"
        ],
        "feature": [
          "Ֆունկցիոնալություն",
          "Հատկություն"
        ],
        "given": [
          "* ",
          "Դիցուք "
        ],
        "name": "Armenian",
        "native": "հայերեն",
        "scenario": [
          "Սցենար"
        ],
        "scenarioOutline": [
          "Սցենարի կառուցվացքը"
        ],
        "then": [
          "* ",
          "Ապա "
        ],
        "when": [
          "* ",
          "Եթե ",
          "Երբ "
        ]
      },
      "ar": {
        "and": [
          "* ",
          "و "
        ],
        "background": [
          "الخلفية"
        ],
        "but": [
          "* ",
          "لكن "
        ],
        "examples": [
          "امثلة"
        ],
        "feature": [
          "خاصية"
        ],
        "given": [
          "* ",
          "بفرض "
        ],
        "name": "Arabic",
        "native": "العربية",
        "scenario": [
          "سيناريو"
        ],
        "scenarioOutline": [
          "سيناريو مخطط"
        ],
        "then": [
          "* ",
          "اذاً ",
          "ثم "
        ],
        "when": [
          "* ",
          "متى ",
          "عندما "
        ]
      },
      "ast": {
        "and": [
          "* ",
          "Y ",
          "Ya "
        ],
        "background": [
          "Antecedentes"
        ],
        "but": [
          "* ",
          "Peru "
        ],
        "examples": [
          "Exemplos"
        ],
        "feature": [
          "Carauterística"
        ],
        "given": [
          "* ",
          "Dáu ",
          "Dada ",
          "Daos ",
          "Daes "
        ],
        "name": "Asturian",
        "native": "asturianu",
        "scenario": [
          "Casu"
        ],
        "scenarioOutline": [
          "Esbozu del casu"
        ],
        "then": [
          "* ",
          "Entós "
        ],
        "when": [
          "* ",
          "Cuando "
        ]
      },
      "az": {
        "and": [
          "* ",
          "Və ",
          "Həm "
        ],
        "background": [
          "Keçmiş",
          "Kontekst"
        ],
        "but": [
          "* ",
          "Amma ",
          "Ancaq "
        ],
        "examples": [
          "Nümunələr"
        ],
        "feature": [
          "Özəllik"
        ],
        "given": [
          "* ",
          "Tutaq ki ",
          "Verilir "
        ],
        "name": "Azerbaijani",
        "native": "Azərbaycanca",
        "scenario": [
          "Ssenari"
        ],
        "scenarioOutline": [
          "Ssenarinin strukturu"
        ],
        "then": [
          "* ",
          "O halda "
        ],
        "when": [
          "* ",
          "Əgər ",
          "Nə vaxt ki "
        ]
      },
      "bg": {
        "and": [
          "* ",
          "И "
        ],
        "background": [
          "Предистория"
        ],
        "but": [
          "* ",
          "Но "
        ],
        "examples": [
          "Примери"
        ],
        "feature": [
          "Функционалност"
        ],
        "given": [
          "* ",
          "Дадено "
        ],
        "name": "Bulgarian",
        "native": "български",
        "scenario": [
          "Сценарий"
        ],
        "scenarioOutline": [
          "Рамка на сценарий"
        ],
        "then": [
          "* ",
          "То "
        ],
        "when": [
          "* ",
          "Когато "
        ]
      },
      "bm": {
        "and": [
          "* ",
          "Dan "
        ],
        "background": [
          "Latar Belakang"
        ],
        "but": [
          "* ",
          "Tetapi ",
          "Tapi "
        ],
        "examples": [
          "Contoh"
        ],
        "feature": [
          "Fungsi"
        ],
        "given": [
          "* ",
          "Diberi ",
          "Bagi "
        ],
        "name": "Malay",
        "native": "Bahasa Melayu",
        "scenario": [
          "Senario",
          "Situasi",
          "Keadaan"
        ],
        "scenarioOutline": [
          "Kerangka Senario",
          "Kerangka Situasi",
          "Kerangka Keadaan",
          "Garis Panduan Senario"
        ],
        "then": [
          "* ",
          "Maka ",
          "Kemudian "
        ],
        "when": [
          "* ",
          "Apabila "
        ]
      },
      "bs": {
        "and": [
          "* ",
          "I ",
          "A "
        ],
        "background": [
          "Pozadina"
        ],
        "but": [
          "* ",
          "Ali "
        ],
        "examples": [
          "Primjeri"
        ],
        "feature": [
          "Karakteristika"
        ],
        "given": [
          "* ",
          "Dato "
        ],
        "name": "Bosnian",
        "native": "Bosanski",
        "scenario": [
          "Scenariju",
          "Scenario"
        ],
        "scenarioOutline": [
          "Scenariju-obris",
          "Scenario-outline"
        ],
        "then": [
          "* ",
          "Zatim "
        ],
        "when": [
          "* ",
          "Kada "
        ]
      },
      "ca": {
        "and": [
          "* ",
          "I "
        ],
        "background": [
          "Rerefons",
          "Antecedents"
        ],
        "but": [
          "* ",
          "Però "
        ],
        "examples": [
          "Exemples"
        ],
        "feature": [
          "Característica",
          "Funcionalitat"
        ],
        "given": [
          "* ",
          "Donat ",
          "Donada ",
          "Atès ",
          "Atesa "
        ],
        "name": "Catalan",
        "native": "català",
        "scenario": [
          "Escenari"
        ],
        "scenarioOutline": [
          "Esquema de l'escenari"
        ],
        "then": [
          "* ",
          "Aleshores ",
          "Cal "
        ],
        "when": [
          "* ",
          "Quan "
        ]
      },
      "cs": {
        "and": [
          "* ",
          "A také ",
          "A "
        ],
        "background": [
          "Pozadí",
          "Kontext"
        ],
        "but": [
          "* ",
          "Ale "
        ],
        "examples": [
          "Příklady"
        ],
        "feature": [
          "Požadavek"
        ],
        "given": [
          "* ",
          "Pokud ",
          "Za předpokladu "
        ],
        "name": "Czech",
        "native": "Česky",
        "scenario": [
          "Scénář"
        ],
        "scenarioOutline": [
          "Náčrt Scénáře",
          "Osnova scénáře"
        ],
        "then": [
          "* ",
          "Pak "
        ],
        "when": [
          "* ",
          "Když "
        ]
      },
      "cy-GB": {
        "and": [
          "* ",
          "A "
        ],
        "background": [
          "Cefndir"
        ],
        "but": [
          "* ",
          "Ond "
        ],
        "examples": [
          "Enghreifftiau"
        ],
        "feature": [
          "Arwedd"
        ],
        "given": [
          "* ",
          "Anrhegedig a "
        ],
        "name": "Welsh",
        "native": "Cymraeg",
        "scenario": [
          "Scenario"
        ],
        "scenarioOutline": [
          "Scenario Amlinellol"
        ],
        "then": [
          "* ",
          "Yna "
        ],
        "when": [
          "* ",
          "Pryd "
        ]
      },
      "da": {
        "and": [
          "* ",
          "Og "
        ],
        "background": [
          "Baggrund"
        ],
        "but": [
          "* ",
          "Men "
        ],
        "examples": [
          "Eksempler"
        ],
        "feature": [
          "Egenskab"
        ],
        "given": [
          "* ",
          "Givet "
        ],
        "name": "Danish",
        "native": "dansk",
        "scenario": [
          "Scenarie"
        ],
        "scenarioOutline": [
          "Abstrakt Scenario"
        ],
        "then": [
          "* ",
          "Så "
        ],
        "when": [
          "* ",
          "Når "
        ]
      },
      "de": {
        "and": [
          "* ",
          "Und "
        ],
        "background": [
          "Grundlage"
        ],
        "but": [
          "* ",
          "Aber "
        ],
        "examples": [
          "Beispiele"
        ],
        "feature": [
          "Funktionalität"
        ],
        "given": [
          "* ",
          "Angenommen ",
          "Gegeben sei ",
          "Gegeben seien "
        ],
        "name": "German",
        "native": "Deutsch",
        "scenario": [
          "Szenario"
        ],
        "scenarioOutline": [
          "Szenariogrundriss"
        ],
        "then": [
          "* ",
          "Dann "
        ],
        "when": [
          "* ",
          "Wenn "
        ]
      },
      "el": {
        "and": [
          "* ",
          "Και "
        ],
        "background": [
          "Υπόβαθρο"
        ],
        "but": [
          "* ",
          "Αλλά "
        ],
        "examples": [
          "Παραδείγματα",
          "Σενάρια"
        ],
        "feature": [
          "Δυνατότητα",
          "Λειτουργία"
        ],
        "given": [
          "* ",
          "Δεδομένου "
        ],
        "name": "Greek",
        "native": "Ελληνικά",
        "scenario": [
          "Σενάριο"
        ],
        "scenarioOutline": [
          "Περιγραφή Σεναρίου"
        ],
        "then": [
          "* ",
          "Τότε "
        ],
        "when": [
          "* ",
          "Όταν "
        ]
      },
      "em": {
        "and": [
          "* ",
          "😂"
        ],
        "background": [
          "💤"
        ],
        "but": [
          "* ",
          "😔"
        ],
        "examples": [
          "📓"
        ],
        "feature": [
          "📚"
        ],
        "given": [
          "* ",
          "😐"
        ],
        "name": "Emoji",
        "native": "😀",
        "scenario": [
          "📕"
        ],
        "scenarioOutline": [
          "📖"
        ],
        "then": [
          "* ",
          "🙏"
        ],
        "when": [
          "* ",
          "🎬"
        ]
      },
      "en": {
        "and": [
          "* ",
          "And "
        ],
        "background": [
          "Background"
        ],
        "but": [
          "* ",
          "But "
        ],
        "examples": [
          "Examples",
          "Scenarios"
        ],
        "feature": [
          "Feature",
          "Business Need",
          "Ability"
        ],
        "given": [
          "* ",
          "Given "
        ],
        "name": "English",
        "native": "English",
        "scenario": [
          "Scenario"
        ],
        "scenarioOutline": [
          "Scenario Outline",
          "Scenario Template"
        ],
        "then": [
          "* ",
          "Then "
        ],
        "when": [
          "* ",
          "When "
        ]
      },
      "en-Scouse": {
        "and": [
          "* ",
          "An "
        ],
        "background": [
          "Dis is what went down"
        ],
        "but": [
          "* ",
          "Buh "
        ],
        "examples": [
          "Examples"
        ],
        "feature": [
          "Feature"
        ],
        "given": [
          "* ",
          "Givun ",
          "Youse know when youse got "
        ],
        "name": "Scouse",
        "native": "Scouse",
        "scenario": [
          "The thing of it is"
        ],
        "scenarioOutline": [
          "Wharrimean is"
        ],
        "then": [
          "* ",
          "Dun ",
          "Den youse gotta "
        ],
        "when": [
          "* ",
          "Wun ",
          "Youse know like when "
        ]
      },
      "en-au": {
        "and": [
          "* ",
          "Too right "
        ],
        "background": [
          "First off"
        ],
        "but": [
          "* ",
          "Yeah nah "
        ],
        "examples": [
          "You'll wanna"
        ],
        "feature": [
          "Pretty much"
        ],
        "given": [
          "* ",
          "Y'know "
        ],
        "name": "Australian",
        "native": "Australian",
        "scenario": [
          "Awww, look mate"
        ],
        "scenarioOutline": [
          "Reckon it's like"
        ],
        "then": [
          "* ",
          "But at the end of the day I reckon "
        ],
        "when": [
          "* ",
          "It's just unbelievable "
        ]
      },
      "en-lol": {
        "and": [
          "* ",
          "AN "
        ],
        "background": [
          "B4"
        ],
        "but": [
          "* ",
          "BUT "
        ],
        "examples": [
          "EXAMPLZ"
        ],
        "feature": [
          "OH HAI"
        ],
        "given": [
          "* ",
          "I CAN HAZ "
        ],
        "name": "LOLCAT",
        "native": "LOLCAT",
        "scenario": [
          "MISHUN"
        ],
        "scenarioOutline": [
          "MISHUN SRSLY"
        ],
        "then": [
          "* ",
          "DEN "
        ],
        "when": [
          "* ",
          "WEN "
        ]
      },
      "en-old": {
        "and": [
          "* ",
          "Ond ",
          "7 "
        ],
        "background": [
          "Aer",
          "Ær"
        ],
        "but": [
          "* ",
          "Ac "
        ],
        "examples": [
          "Se the",
          "Se þe",
          "Se ðe"
        ],
        "feature": [
          "Hwaet",
          "Hwæt"
        ],
        "given": [
          "* ",
          "Thurh ",
          "Þurh ",
          "Ðurh "
        ],
        "name": "Old English",
        "native": "Englisc",
        "scenario": [
          "Swa"
        ],
        "scenarioOutline": [
          "Swa hwaer swa",
          "Swa hwær swa"
        ],
        "then": [
          "* ",
          "Tha ",
          "Þa ",
          "Ða ",
          "Tha the ",
          "Þa þe ",
          "Ða ðe "
        ],
        "when": [
          "* ",
          "Tha ",
          "Þa ",
          "Ða "
        ]
      },
      "en-pirate": {
        "and": [
          "* ",
          "Aye "
        ],
        "background": [
          "Yo-ho-ho"
        ],
        "but": [
          "* ",
          "Avast! "
        ],
        "examples": [
          "Dead men tell no tales"
        ],
        "feature": [
          "Ahoy matey!"
        ],
        "given": [
          "* ",
          "Gangway! "
        ],
        "name": "Pirate",
        "native": "Pirate",
        "scenario": [
          "Heave to"
        ],
        "scenarioOutline": [
          "Shiver me timbers"
        ],
        "then": [
          "* ",
          "Let go and haul "
        ],
        "when": [
          "* ",
          "Blimey! "
        ]
      },
      "eo": {
        "and": [
          "* ",
          "Kaj "
        ],
        "background": [
          "Fono"
        ],
        "but": [
          "* ",
          "Sed "
        ],
        "examples": [
          "Ekzemploj"
        ],
        "feature": [
          "Trajto"
        ],
        "given": [
          "* ",
          "Donitaĵo ",
          "Komence "
        ],
        "name": "Esperanto",
        "native": "Esperanto",
        "scenario": [
          "Scenaro",
          "Kazo"
        ],
        "scenarioOutline": [
          "Konturo de la scenaro",
          "Skizo",
          "Kazo-skizo"
        ],
        "then": [
          "* ",
          "Do "
        ],
        "when": [
          "* ",
          "Se "
        ]
      },
      "es": {
        "and": [
          "* ",
          "Y ",
          "E "
        ],
        "background": [
          "Antecedentes"
        ],
        "but": [
          "* ",
          "Pero "
        ],
        "examples": [
          "Ejemplos"
        ],
        "feature": [
          "Característica"
        ],
        "given": [
          "* ",
          "Dado ",
          "Dada ",
          "Dados ",
          "Dadas "
        ],
        "name": "Spanish",
        "native": "español",
        "scenario": [
          "Escenario"
        ],
        "scenarioOutline": [
          "Esquema del escenario"
        ],
        "then": [
          "* ",
          "Entonces "
        ],
        "when": [
          "* ",
          "Cuando "
        ]
      },
      "et": {
        "and": [
          "* ",
          "Ja "
        ],
        "background": [
          "Taust"
        ],
        "but": [
          "* ",
          "Kuid "
        ],
        "examples": [
          "Juhtumid"
        ],
        "feature": [
          "Omadus"
        ],
        "given": [
          "* ",
          "Eeldades "
        ],
        "name": "Estonian",
        "native": "eesti keel",
        "scenario": [
          "Stsenaarium"
        ],
        "scenarioOutline": [
          "Raamstsenaarium"
        ],
        "then": [
          "* ",
          "Siis "
        ],
        "when": [
          "* ",
          "Kui "
        ]
      },
      "fa": {
        "and": [
          "* ",
          "و "
        ],
        "background": [
          "زمینه"
        ],
        "but": [
          "* ",
          "اما "
        ],
        "examples": [
          "نمونه ها"
        ],
        "feature": [
          "وِیژگی"
        ],
        "given": [
          "* ",
          "با فرض "
        ],
        "name": "Persian",
        "native": "فارسی",
        "scenario": [
          "سناریو"
        ],
        "scenarioOutline": [
          "الگوی سناریو"
        ],
        "then": [
          "* ",
          "آنگاه "
        ],
        "when": [
          "* ",
          "هنگامی "
        ]
      },
      "fi": {
        "and": [
          "* ",
          "Ja "
        ],
        "background": [
          "Tausta"
        ],
        "but": [
          "* ",
          "Mutta "
        ],
        "examples": [
          "Tapaukset"
        ],
        "feature": [
          "Ominaisuus"
        ],
        "given": [
          "* ",
          "Oletetaan "
        ],
        "name": "Finnish",
        "native": "suomi",
        "scenario": [
          "Tapaus"
        ],
        "scenarioOutline": [
          "Tapausaihio"
        ],
        "then": [
          "* ",
          "Niin "
        ],
        "when": [
          "* ",
          "Kun "
        ]
      },
      "fr": {
        "and": [
          "* ",
          "Et que ",
          "Et qu'",
          "Et "
        ],
        "background": [
          "Contexte"
        ],
        "but": [
          "* ",
          "Mais que ",
          "Mais qu'",
          "Mais "
        ],
        "examples": [
          "Exemples"
        ],
        "feature": [
          "Fonctionnalité"
        ],
        "given": [
          "* ",
          "Soit ",
          "Etant donné que ",
          "Etant donné qu'",
          "Etant donné ",
          "Etant donnée ",
          "Etant donnés ",
          "Etant données ",
          "Étant donné que ",
          "Étant donné qu'",
          "Étant donné ",
          "Étant donnée ",
          "Étant donnés ",
          "Étant données "
        ],
        "name": "French",
        "native": "français",
        "scenario": [
          "Scénario"
        ],
        "scenarioOutline": [
          "Plan du scénario",
          "Plan du Scénario"
        ],
        "then": [
          "* ",
          "Alors "
        ],
        "when": [
          "* ",
          "Quand ",
          "Lorsque ",
          "Lorsqu'"
        ]
      },
      "ga": {
        "and": [
          "* ",
          "Agus"
        ],
        "background": [
          "Cúlra"
        ],
        "but": [
          "* ",
          "Ach"
        ],
        "examples": [
          "Samplaí"
        ],
        "feature": [
          "Gné"
        ],
        "given": [
          "* ",
          "Cuir i gcás go",
          "Cuir i gcás nach",
          "Cuir i gcás gur",
          "Cuir i gcás nár"
        ],
        "name": "Irish",
        "native": "Gaeilge",
        "scenario": [
          "Cás"
        ],
        "scenarioOutline": [
          "Cás Achomair"
        ],
        "then": [
          "* ",
          "Ansin"
        ],
        "when": [
          "* ",
          "Nuair a",
          "Nuair nach",
          "Nuair ba",
          "Nuair nár"
        ]
      },
      "gj": {
        "and": [
          "* ",
          "અને "
        ],
        "background": [
          "બેકગ્રાઉન્ડ"
        ],
        "but": [
          "* ",
          "પણ "
        ],
        "examples": [
          "ઉદાહરણો"
        ],
        "feature": [
          "લક્ષણ",
          "વ્યાપાર જરૂર",
          "ક્ષમતા"
        ],
        "given": [
          "* ",
          "આપેલ છે "
        ],
        "name": "Gujarati",
        "native": "ગુજરાતી",
        "scenario": [
          "સ્થિતિ"
        ],
        "scenarioOutline": [
          "પરિદ્દશ્ય રૂપરેખા",
          "પરિદ્દશ્ય ઢાંચો"
        ],
        "then": [
          "* ",
          "પછી "
        ],
        "when": [
          "* ",
          "ક્યારે "
        ]
      },
      "gl": {
        "and": [
          "* ",
          "E "
        ],
        "background": [
          "Contexto"
        ],
        "but": [
          "* ",
          "Mais ",
          "Pero "
        ],
        "examples": [
          "Exemplos"
        ],
        "feature": [
          "Característica"
        ],
        "given": [
          "* ",
          "Dado ",
          "Dada ",
          "Dados ",
          "Dadas "
        ],
        "name": "Galician",
        "native": "galego",
        "scenario": [
          "Escenario"
        ],
        "scenarioOutline": [
          "Esbozo do escenario"
        ],
        "then": [
          "* ",
          "Entón ",
          "Logo "
        ],
        "when": [
          "* ",
          "Cando "
        ]
      },
      "he": {
        "and": [
          "* ",
          "וגם "
        ],
        "background": [
          "רקע"
        ],
        "but": [
          "* ",
          "אבל "
        ],
        "examples": [
          "דוגמאות"
        ],
        "feature": [
          "תכונה"
        ],
        "given": [
          "* ",
          "בהינתן "
        ],
        "name": "Hebrew",
        "native": "עברית",
        "scenario": [
          "תרחיש"
        ],
        "scenarioOutline": [
          "תבנית תרחיש"
        ],
        "then": [
          "* ",
          "אז ",
          "אזי "
        ],
        "when": [
          "* ",
          "כאשר "
        ]
      },
      "hi": {
        "and": [
          "* ",
          "और ",
          "तथा "
        ],
        "background": [
          "पृष्ठभूमि"
        ],
        "but": [
          "* ",
          "पर ",
          "परन्तु ",
          "किन्तु "
        ],
        "examples": [
          "उदाहरण"
        ],
        "feature": [
          "रूप लेख"
        ],
        "given": [
          "* ",
          "अगर ",
          "यदि ",
          "चूंकि "
        ],
        "name": "Hindi",
        "native": "हिंदी",
        "scenario": [
          "परिदृश्य"
        ],
        "scenarioOutline": [
          "परिदृश्य रूपरेखा"
        ],
        "then": [
          "* ",
          "तब ",
          "तदा "
        ],
        "when": [
          "* ",
          "जब ",
          "कदा "
        ]
      },
      "hr": {
        "and": [
          "* ",
          "I "
        ],
        "background": [
          "Pozadina"
        ],
        "but": [
          "* ",
          "Ali "
        ],
        "examples": [
          "Primjeri",
          "Scenariji"
        ],
        "feature": [
          "Osobina",
          "Mogućnost",
          "Mogucnost"
        ],
        "given": [
          "* ",
          "Zadan ",
          "Zadani ",
          "Zadano "
        ],
        "name": "Croatian",
        "native": "hrvatski",
        "scenario": [
          "Scenarij"
        ],
        "scenarioOutline": [
          "Skica",
          "Koncept"
        ],
        "then": [
          "* ",
          "Onda "
        ],
        "when": [
          "* ",
          "Kada ",
          "Kad "
        ]
      },
      "ht": {
        "and": [
          "* ",
          "Ak ",
          "Epi ",
          "E "
        ],
        "background": [
          "Kontèks",
          "Istorik"
        ],
        "but": [
          "* ",
          "Men "
        ],
        "examples": [
          "Egzanp"
        ],
        "feature": [
          "Karakteristik",
          "Mak",
          "Fonksyonalite"
        ],
        "given": [
          "* ",
          "Sipoze ",
          "Sipoze ke ",
          "Sipoze Ke "
        ],
        "name": "Creole",
        "native": "kreyòl",
        "scenario": [
          "Senaryo"
        ],
        "scenarioOutline": [
          "Plan senaryo",
          "Plan Senaryo",
          "Senaryo deskripsyon",
          "Senaryo Deskripsyon",
          "Dyagram senaryo",
          "Dyagram Senaryo"
        ],
        "then": [
          "* ",
          "Lè sa a ",
          "Le sa a "
        ],
        "when": [
          "* ",
          "Lè ",
          "Le "
        ]
      },
      "hu": {
        "and": [
          "* ",
          "És "
        ],
        "background": [
          "Háttér"
        ],
        "but": [
          "* ",
          "De "
        ],
        "examples": [
          "Példák"
        ],
        "feature": [
          "Jellemző"
        ],
        "given": [
          "* ",
          "Amennyiben ",
          "Adott "
        ],
        "name": "Hungarian",
        "native": "magyar",
        "scenario": [
          "Forgatókönyv"
        ],
        "scenarioOutline": [
          "Forgatókönyv vázlat"
        ],
        "then": [
          "* ",
          "Akkor "
        ],
        "when": [
          "* ",
          "Majd ",
          "Ha ",
          "Amikor "
        ]
      },
      "id": {
        "and": [
          "* ",
          "Dan "
        ],
        "background": [
          "Dasar"
        ],
        "but": [
          "* ",
          "Tapi "
        ],
        "examples": [
          "Contoh"
        ],
        "feature": [
          "Fitur"
        ],
        "given": [
          "* ",
          "Dengan "
        ],
        "name": "Indonesian",
        "native": "Bahasa Indonesia",
        "scenario": [
          "Skenario"
        ],
        "scenarioOutline": [
          "Skenario konsep"
        ],
        "then": [
          "* ",
          "Maka "
        ],
        "when": [
          "* ",
          "Ketika "
        ]
      },
      "is": {
        "and": [
          "* ",
          "Og "
        ],
        "background": [
          "Bakgrunnur"
        ],
        "but": [
          "* ",
          "En "
        ],
        "examples": [
          "Dæmi",
          "Atburðarásir"
        ],
        "feature": [
          "Eiginleiki"
        ],
        "given": [
          "* ",
          "Ef "
        ],
        "name": "Icelandic",
        "native": "Íslenska",
        "scenario": [
          "Atburðarás"
        ],
        "scenarioOutline": [
          "Lýsing Atburðarásar",
          "Lýsing Dæma"
        ],
        "then": [
          "* ",
          "Þá "
        ],
        "when": [
          "* ",
          "Þegar "
        ]
      },
      "it": {
        "and": [
          "* ",
          "E "
        ],
        "background": [
          "Contesto"
        ],
        "but": [
          "* ",
          "Ma "
        ],
        "examples": [
          "Esempi"
        ],
        "feature": [
          "Funzionalità"
        ],
        "given": [
          "* ",
          "Dato ",
          "Data ",
          "Dati ",
          "Date "
        ],
        "name": "Italian",
        "native": "italiano",
        "scenario": [
          "Scenario"
        ],
        "scenarioOutline": [
          "Schema dello scenario"
        ],
        "then": [
          "* ",
          "Allora "
        ],
        "when": [
          "* ",
          "Quando "
        ]
      },
      "ja": {
        "and": [
          "* ",
          "かつ"
        ],
        "background": [
          "背景"
        ],
        "but": [
          "* ",
          "しかし",
          "但し",
          "ただし"
        ],
        "examples": [
          "例",
          "サンプル"
        ],
        "feature": [
          "フィーチャ",
          "機能"
        ],
        "given": [
          "* ",
          "前提"
        ],
        "name": "Japanese",
        "native": "日本語",
        "scenario": [
          "シナリオ"
        ],
        "scenarioOutline": [
          "シナリオアウトライン",
          "シナリオテンプレート",
          "テンプレ",
          "シナリオテンプレ"
        ],
        "then": [
          "* ",
          "ならば"
        ],
        "when": [
          "* ",
          "もし"
        ]
      },
      "jv": {
        "and": [
          "* ",
          "Lan "
        ],
        "background": [
          "Dasar"
        ],
        "but": [
          "* ",
          "Tapi ",
          "Nanging ",
          "Ananging "
        ],
        "examples": [
          "Conto",
          "Contone"
        ],
        "feature": [
          "Fitur"
        ],
        "given": [
          "* ",
          "Nalika ",
          "Nalikaning "
        ],
        "name": "Javanese",
        "native": "Basa Jawa",
        "scenario": [
          "Skenario"
        ],
        "scenarioOutline": [
          "Konsep skenario"
        ],
        "then": [
          "* ",
          "Njuk ",
          "Banjur "
        ],
        "when": [
          "* ",
          "Manawa ",
          "Menawa "
        ]
      },
      "ka": {
        "and": [
          "* ",
          "და"
        ],
        "background": [
          "კონტექსტი"
        ],
        "but": [
          "* ",
          "მაგ­რამ"
        ],
        "examples": [
          "მაგალითები"
        ],
        "feature": [
          "თვისება"
        ],
        "given": [
          "* ",
          "მოცემული"
        ],
        "name": "Georgian",
        "native": "ქართველი",
        "scenario": [
          "სცენარის"
        ],
        "scenarioOutline": [
          "სცენარის ნიმუში"
        ],
        "then": [
          "* ",
          "მაშინ"
        ],
        "when": [
          "* ",
          "როდესაც"
        ]
      },
      "kn": {
        "and": [
          "* ",
          "ಮತ್ತು "
        ],
        "background": [
          "ಹಿನ್ನೆಲೆ"
        ],
        "but": [
          "* ",
          "ಆದರೆ "
        ],
        "examples": [
          "ಉದಾಹರಣೆಗಳು"
        ],
        "feature": [
          "ಹೆಚ್ಚಳ"
        ],
        "given": [
          "* ",
          "ನೀಡಿದ "
        ],
        "name": "Kannada",
        "native": "ಕನ್ನಡ",
        "scenario": [
          "ಕಥಾಸಾರಾಂಶ"
        ],
        "scenarioOutline": [
          "ವಿವರಣೆ"
        ],
        "then": [
          "* ",
          "ನಂತರ "
        ],
        "when": [
          "* ",
          "ಸ್ಥಿತಿಯನ್ನು "
        ]
      },
      "ko": {
        "and": [
          "* ",
          "그리고"
        ],
        "background": [
          "배경"
        ],
        "but": [
          "* ",
          "하지만",
          "단"
        ],
        "examples": [
          "예"
        ],
        "feature": [
          "기능"
        ],
        "given": [
          "* ",
          "조건",
          "먼저"
        ],
        "name": "Korean",
        "native": "한국어",
        "scenario": [
          "시나리오"
        ],
        "scenarioOutline": [
          "시나리오 개요"
        ],
        "then": [
          "* ",
          "그러면"
        ],
        "when": [
          "* ",
          "만일",
          "만약"
        ]
      },
      "lt": {
        "and": [
          "* ",
          "Ir "
        ],
        "background": [
          "Kontekstas"
        ],
        "but": [
          "* ",
          "Bet "
        ],
        "examples": [
          "Pavyzdžiai",
          "Scenarijai",
          "Variantai"
        ],
        "feature": [
          "Savybė"
        ],
        "given": [
          "* ",
          "Duota "
        ],
        "name": "Lithuanian",
        "native": "lietuvių kalba",
        "scenario": [
          "Scenarijus"
        ],
        "scenarioOutline": [
          "Scenarijaus šablonas"
        ],
        "then": [
          "* ",
          "Tada "
        ],
        "when": [
          "* ",
          "Kai "
        ]
      },
      "lu": {
        "and": [
          "* ",
          "an ",
          "a "
        ],
        "background": [
          "Hannergrond"
        ],
        "but": [
          "* ",
          "awer ",
          "mä "
        ],
        "examples": [
          "Beispiller"
        ],
        "feature": [
          "Funktionalitéit"
        ],
        "given": [
          "* ",
          "ugeholl "
        ],
        "name": "Luxemburgish",
        "native": "Lëtzebuergesch",
        "scenario": [
          "Szenario"
        ],
        "scenarioOutline": [
          "Plang vum Szenario"
        ],
        "then": [
          "* ",
          "dann "
        ],
        "when": [
          "* ",
          "wann "
        ]
      },
      "lv": {
        "and": [
          "* ",
          "Un "
        ],
        "background": [
          "Konteksts",
          "Situācija"
        ],
        "but": [
          "* ",
          "Bet "
        ],
        "examples": [
          "Piemēri",
          "Paraugs"
        ],
        "feature": [
          "Funkcionalitāte",
          "Fīča"
        ],
        "given": [
          "* ",
          "Kad "
        ],
        "name": "Latvian",
        "native": "latviešu",
        "scenario": [
          "Scenārijs"
        ],
        "scenarioOutline": [
          "Scenārijs pēc parauga"
        ],
        "then": [
          "* ",
          "Tad "
        ],
        "when": [
          "* ",
          "Ja "
        ]
      },
      "mk-Cyrl": {
        "and": [
          "* ",
          "И "
        ],
        "background": [
          "Контекст",
          "Содржина"
        ],
        "but": [
          "* ",
          "Но "
        ],
        "examples": [
          "Примери",
          "Сценарија"
        ],
        "feature": [
          "Функционалност",
          "Бизнис потреба",
          "Можност"
        ],
        "given": [
          "* ",
          "Дадено ",
          "Дадена "
        ],
        "name": "Macedonian",
        "native": "Македонски",
        "scenario": [
          "Сценарио",
          "На пример"
        ],
        "scenarioOutline": [
          "Преглед на сценарија",
          "Скица",
          "Концепт"
        ],
        "then": [
          "* ",
          "Тогаш "
        ],
        "when": [
          "* ",
          "Кога "
        ]
      },
      "mk-Latn": {
        "and": [
          "* ",
          "I "
        ],
        "background": [
          "Kontekst",
          "Sodrzhina"
        ],
        "but": [
          "* ",
          "No "
        ],
        "examples": [
          "Primeri",
          "Scenaria"
        ],
        "feature": [
          "Funkcionalnost",
          "Biznis potreba",
          "Mozhnost"
        ],
        "given": [
          "* ",
          "Dadeno ",
          "Dadena "
        ],
        "name": "Macedonian (Latin)",
        "native": "Makedonski (Latinica)",
        "scenario": [
          "Scenario",
          "Na primer"
        ],
        "scenarioOutline": [
          "Pregled na scenarija",
          "Skica",
          "Koncept"
        ],
        "then": [
          "* ",
          "Togash "
        ],
        "when": [
          "* ",
          "Koga "
        ]
      },
      "mn": {
        "and": [
          "* ",
          "Мөн ",
          "Тэгээд "
        ],
        "background": [
          "Агуулга"
        ],
        "but": [
          "* ",
          "Гэхдээ ",
          "Харин "
        ],
        "examples": [
          "Тухайлбал"
        ],
        "feature": [
          "Функц",
          "Функционал"
        ],
        "given": [
          "* ",
          "Өгөгдсөн нь ",
          "Анх "
        ],
        "name": "Mongolian",
        "native": "монгол",
        "scenario": [
          "Сценар"
        ],
        "scenarioOutline": [
          "Сценарын төлөвлөгөө"
        ],
        "then": [
          "* ",
          "Тэгэхэд ",
          "Үүний дараа "
        ],
        "when": [
          "* ",
          "Хэрэв "
        ]
      },
      "nl": {
        "and": [
          "* ",
          "En "
        ],
        "background": [
          "Achtergrond"
        ],
        "but": [
          "* ",
          "Maar "
        ],
        "examples": [
          "Voorbeelden"
        ],
        "feature": [
          "Functionaliteit"
        ],
        "given": [
          "* ",
          "Gegeven ",
          "Stel "
        ],
        "name": "Dutch",
        "native": "Nederlands",
        "scenario": [
          "Scenario"
        ],
        "scenarioOutline": [
          "Abstract Scenario"
        ],
        "then": [
          "* ",
          "Dan "
        ],
        "when": [
          "* ",
          "Als ",
          "Wanneer "
        ]
      },
      "no": {
        "and": [
          "* ",
          "Og "
        ],
        "background": [
          "Bakgrunn"
        ],
        "but": [
          "* ",
          "Men "
        ],
        "examples": [
          "Eksempler"
        ],
        "feature": [
          "Egenskap"
        ],
        "given": [
          "* ",
          "Gitt "
        ],
        "name": "Norwegian",
        "native": "norsk",
        "scenario": [
          "Scenario"
        ],
        "scenarioOutline": [
          "Scenariomal",
          "Abstrakt Scenario"
        ],
        "then": [
          "* ",
          "Så "
        ],
        "when": [
          "* ",
          "Når "
        ]
      },
      "pa": {
        "and": [
          "* ",
          "ਅਤੇ "
        ],
        "background": [
          "ਪਿਛੋਕੜ"
        ],
        "but": [
          "* ",
          "ਪਰ "
        ],
        "examples": [
          "ਉਦਾਹਰਨਾਂ"
        ],
        "feature": [
          "ਖਾਸੀਅਤ",
          "ਮੁਹਾਂਦਰਾ",
          "ਨਕਸ਼ ਨੁਹਾਰ"
        ],
        "given": [
          "* ",
          "ਜੇਕਰ ",
          "ਜਿਵੇਂ ਕਿ "
        ],
        "name": "Panjabi",
        "native": "ਪੰਜਾਬੀ",
        "scenario": [
          "ਪਟਕਥਾ"
        ],
        "scenarioOutline": [
          "ਪਟਕਥਾ ਢਾਂਚਾ",
          "ਪਟਕਥਾ ਰੂਪ ਰੇਖਾ"
        ],
        "then": [
          "* ",
          "ਤਦ "
        ],
        "when": [
          "* ",
          "ਜਦੋਂ "
        ]
      },
      "pl": {
        "and": [
          "* ",
          "Oraz ",
          "I "
        ],
        "background": [
          "Założenia"
        ],
        "but": [
          "* ",
          "Ale "
        ],
        "examples": [
          "Przykłady"
        ],
        "feature": [
          "Właściwość",
          "Funkcja",
          "Aspekt",
          "Potrzeba biznesowa"
        ],
        "given": [
          "* ",
          "Zakładając ",
          "Mając ",
          "Zakładając, że "
        ],
        "name": "Polish",
        "native": "polski",
        "scenario": [
          "Scenariusz"
        ],
        "scenarioOutline": [
          "Szablon scenariusza"
        ],
        "then": [
          "* ",
          "Wtedy "
        ],
        "when": [
          "* ",
          "Jeżeli ",
          "Jeśli ",
          "Gdy ",
          "Kiedy "
        ]
      },
      "pt": {
        "and": [
          "* ",
          "E "
        ],
        "background": [
          "Contexto",
          "Cenário de Fundo",
          "Cenario de Fundo",
          "Fundo"
        ],
        "but": [
          "* ",
          "Mas "
        ],
        "examples": [
          "Exemplos",
          "Cenários",
          "Cenarios"
        ],
        "feature": [
          "Funcionalidade",
          "Característica",
          "Caracteristica"
        ],
        "given": [
          "* ",
          "Dado ",
          "Dada ",
          "Dados ",
          "Dadas "
        ],
        "name": "Portuguese",
        "native": "português",
        "scenario": [
          "Cenário",
          "Cenario"
        ],
        "scenarioOutline": [
          "Esquema do Cenário",
          "Esquema do Cenario",
          "Delineação do Cenário",
          "Delineacao do Cenario"
        ],
        "then": [
          "* ",
          "Então ",
          "Entao "
        ],
        "when": [
          "* ",
          "Quando "
        ]
      },
      "ro": {
        "and": [
          "* ",
          "Si ",
          "Și ",
          "Şi "
        ],
        "background": [
          "Context"
        ],
        "but": [
          "* ",
          "Dar "
        ],
        "examples": [
          "Exemple"
        ],
        "feature": [
          "Functionalitate",
          "Funcționalitate",
          "Funcţionalitate"
        ],
        "given": [
          "* ",
          "Date fiind ",
          "Dat fiind ",
          "Dati fiind ",
          "Dați fiind ",
          "Daţi fiind "
        ],
        "name": "Romanian",
        "native": "română",
        "scenario": [
          "Scenariu"
        ],
        "scenarioOutline": [
          "Structura scenariu",
          "Structură scenariu"
        ],
        "then": [
          "* ",
          "Atunci "
        ],
        "when": [
          "* ",
          "Cand ",
          "Când "
        ]
      },
      "ru": {
        "and": [
          "* ",
          "И ",
          "К тому же ",
          "Также "
        ],
        "background": [
          "Предыстория",
          "Контекст"
        ],
        "but": [
          "* ",
          "Но ",
          "А "
        ],
        "examples": [
          "Примеры"
        ],
        "feature": [
          "Функция",
          "Функциональность",
          "Функционал",
          "Свойство"
        ],
        "given": [
          "* ",
          "Допустим ",
          "Дано ",
          "Пусть ",
          "Если "
        ],
        "name": "Russian",
        "native": "русский",
        "scenario": [
          "Сценарий"
        ],
        "scenarioOutline": [
          "Структура сценария"
        ],
        "then": [
          "* ",
          "То ",
          "Затем ",
          "Тогда "
        ],
        "when": [
          "* ",
          "Когда "
        ]
      },
      "sk": {
        "and": [
          "* ",
          "A ",
          "A tiež ",
          "A taktiež ",
          "A zároveň "
        ],
        "background": [
          "Pozadie"
        ],
        "but": [
          "* ",
          "Ale "
        ],
        "examples": [
          "Príklady"
        ],
        "feature": [
          "Požiadavka",
          "Funkcia",
          "Vlastnosť"
        ],
        "given": [
          "* ",
          "Pokiaľ ",
          "Za predpokladu "
        ],
        "name": "Slovak",
        "native": "Slovensky",
        "scenario": [
          "Scenár"
        ],
        "scenarioOutline": [
          "Náčrt Scenáru",
          "Náčrt Scenára",
          "Osnova Scenára"
        ],
        "then": [
          "* ",
          "Tak ",
          "Potom "
        ],
        "when": [
          "* ",
          "Keď ",
          "Ak "
        ]
      },
      "sl": {
        "and": [
          "In ",
          "Ter "
        ],
        "background": [
          "Kontekst",
          "Osnova",
          "Ozadje"
        ],
        "but": [
          "Toda ",
          "Ampak ",
          "Vendar "
        ],
        "examples": [
          "Primeri",
          "Scenariji"
        ],
        "feature": [
          "Funkcionalnost",
          "Funkcija",
          "Možnosti",
          "Moznosti",
          "Lastnost",
          "Značilnost"
        ],
        "given": [
          "Dano ",
          "Podano ",
          "Zaradi ",
          "Privzeto "
        ],
        "name": "Slovenian",
        "native": "Slovenski",
        "scenario": [
          "Scenarij",
          "Primer"
        ],
        "scenarioOutline": [
          "Struktura scenarija",
          "Skica",
          "Koncept",
          "Oris scenarija",
          "Osnutek"
        ],
        "then": [
          "Nato ",
          "Potem ",
          "Takrat "
        ],
        "when": [
          "Ko ",
          "Ce ",
          "Če ",
          "Kadar "
        ]
      },
      "sr-Cyrl": {
        "and": [
          "* ",
          "И "
        ],
        "background": [
          "Контекст",
          "Основа",
          "Позадина"
        ],
        "but": [
          "* ",
          "Али "
        ],
        "examples": [
          "Примери",
          "Сценарији"
        ],
        "feature": [
          "Функционалност",
          "Могућност",
          "Особина"
        ],
        "given": [
          "* ",
          "За дато ",
          "За дате ",
          "За дати "
        ],
        "name": "Serbian",
        "native": "Српски",
        "scenario": [
          "Сценарио",
          "Пример"
        ],
        "scenarioOutline": [
          "Структура сценарија",
          "Скица",
          "Концепт"
        ],
        "then": [
          "* ",
          "Онда "
        ],
        "when": [
          "* ",
          "Када ",
          "Кад "
        ]
      },
      "sr-Latn": {
        "and": [
          "* ",
          "I "
        ],
        "background": [
          "Kontekst",
          "Osnova",
          "Pozadina"
        ],
        "but": [
          "* ",
          "Ali "
        ],
        "examples": [
          "Primeri",
          "Scenariji"
        ],
        "feature": [
          "Funkcionalnost",
          "Mogućnost",
          "Mogucnost",
          "Osobina"
        ],
        "given": [
          "* ",
          "Za dato ",
          "Za date ",
          "Za dati "
        ],
        "name": "Serbian (Latin)",
        "native": "Srpski (Latinica)",
        "scenario": [
          "Scenario",
          "Primer"
        ],
        "scenarioOutline": [
          "Struktura scenarija",
          "Skica",
          "Koncept"
        ],
        "then": [
          "* ",
          "Onda "
        ],
        "when": [
          "* ",
          "Kada ",
          "Kad "
        ]
      },
      "sv": {
        "and": [
          "* ",
          "Och "
        ],
        "background": [
          "Bakgrund"
        ],
        "but": [
          "* ",
          "Men "
        ],
        "examples": [
          "Exempel"
        ],
        "feature": [
          "Egenskap"
        ],
        "given": [
          "* ",
          "Givet "
        ],
        "name": "Swedish",
        "native": "Svenska",
        "scenario": [
          "Scenario"
        ],
        "scenarioOutline": [
          "Abstrakt Scenario",
          "Scenariomall"
        ],
        "then": [
          "* ",
          "Så "
        ],
        "when": [
          "* ",
          "När "
        ]
      },
      "ta": {
        "and": [
          "* ",
          "மேலும்  ",
          "மற்றும் "
        ],
        "background": [
          "பின்னணி"
        ],
        "but": [
          "* ",
          "ஆனால்  "
        ],
        "examples": [
          "எடுத்துக்காட்டுகள்",
          "காட்சிகள்",
          " நிலைமைகளில்"
        ],
        "feature": [
          "அம்சம்",
          "வணிக தேவை",
          "திறன்"
        ],
        "given": [
          "* ",
          "கொடுக்கப்பட்ட "
        ],
        "name": "Tamil",
        "native": "தமிழ்",
        "scenario": [
          "காட்சி"
        ],
        "scenarioOutline": [
          "காட்சி சுருக்கம்",
          "காட்சி வார்ப்புரு"
        ],
        "then": [
          "* ",
          "அப்பொழுது "
        ],
        "when": [
          "* ",
          "எப்போது "
        ]
      },
      "th": {
        "and": [
          "* ",
          "และ "
        ],
        "background": [
          "แนวคิด"
        ],
        "but": [
          "* ",
          "แต่ "
        ],
        "examples": [
          "ชุดของตัวอย่าง",
          "ชุดของเหตุการณ์"
        ],
        "feature": [
          "โครงหลัก",
          "ความต้องการทางธุรกิจ",
          "ความสามารถ"
        ],
        "given": [
          "* ",
          "กำหนดให้ "
        ],
        "name": "Thai",
        "native": "ไทย",
        "scenario": [
          "เหตุการณ์"
        ],
        "scenarioOutline": [
          "สรุปเหตุการณ์",
          "โครงสร้างของเหตุการณ์"
        ],
        "then": [
          "* ",
          "ดังนั้น "
        ],
        "when": [
          "* ",
          "เมื่อ "
        ]
      },
      "tl": {
        "and": [
          "* ",
          "మరియు "
        ],
        "background": [
          "నేపథ్యం"
        ],
        "but": [
          "* ",
          "కాని "
        ],
        "examples": [
          "ఉదాహరణలు"
        ],
        "feature": [
          "గుణము"
        ],
        "given": [
          "* ",
          "చెప్పబడినది "
        ],
        "name": "Telugu",
        "native": "తెలుగు",
        "scenario": [
          "సన్నివేశం"
        ],
        "scenarioOutline": [
          "కథనం"
        ],
        "then": [
          "* ",
          "అప్పుడు "
        ],
        "when": [
          "* ",
          "ఈ పరిస్థితిలో "
        ]
      },
      "tlh": {
        "and": [
          "* ",
          "'ej ",
          "latlh "
        ],
        "background": [
          "mo'"
        ],
        "but": [
          "* ",
          "'ach ",
          "'a "
        ],
        "examples": [
          "ghantoH",
          "lutmey"
        ],
        "feature": [
          "Qap",
          "Qu'meH 'ut",
          "perbogh",
          "poQbogh malja'",
          "laH"
        ],
        "given": [
          "* ",
          "ghu' noblu' ",
          "DaH ghu' bejlu' "
        ],
        "name": "Klingon",
        "native": "tlhIngan",
        "scenario": [
          "lut"
        ],
        "scenarioOutline": [
          "lut chovnatlh"
        ],
        "then": [
          "* ",
          "vaj "
        ],
        "when": [
          "* ",
          "qaSDI' "
        ]
      },
      "tr": {
        "and": [
          "* ",
          "Ve "
        ],
        "background": [
          "Geçmiş"
        ],
        "but": [
          "* ",
          "Fakat ",
          "Ama "
        ],
        "examples": [
          "Örnekler"
        ],
        "feature": [
          "Özellik"
        ],
        "given": [
          "* ",
          "Diyelim ki "
        ],
        "name": "Turkish",
        "native": "Türkçe",
        "scenario": [
          "Senaryo"
        ],
        "scenarioOutline": [
          "Senaryo taslağı"
        ],
        "then": [
          "* ",
          "O zaman "
        ],
        "when": [
          "* ",
          "Eğer ki "
        ]
      },
      "tt": {
        "and": [
          "* ",
          "Һәм ",
          "Вә "
        ],
        "background": [
          "Кереш"
        ],
        "but": [
          "* ",
          "Ләкин ",
          "Әмма "
        ],
        "examples": [
          "Үрнәкләр",
          "Мисаллар"
        ],
        "feature": [
          "Мөмкинлек",
          "Үзенчәлеклелек"
        ],
        "given": [
          "* ",
          "Әйтик "
        ],
        "name": "Tatar",
        "native": "Татарча",
        "scenario": [
          "Сценарий"
        ],
        "scenarioOutline": [
          "Сценарийның төзелеше"
        ],
        "then": [
          "* ",
          "Нәтиҗәдә "
        ],
        "when": [
          "* ",
          "Әгәр "
        ]
      },
      "uk": {
        "and": [
          "* ",
          "І ",
          "А також ",
          "Та "
        ],
        "background": [
          "Передумова"
        ],
        "but": [
          "* ",
          "Але "
        ],
        "examples": [
          "Приклади"
        ],
        "feature": [
          "Функціонал"
        ],
        "given": [
          "* ",
          "Припустимо ",
          "Припустимо, що ",
          "Нехай ",
          "Дано "
        ],
        "name": "Ukrainian",
        "native": "Українська",
        "scenario": [
          "Сценарій"
        ],
        "scenarioOutline": [
          "Структура сценарію"
        ],
        "then": [
          "* ",
          "То ",
          "Тоді "
        ],
        "when": [
          "* ",
          "Якщо ",
          "Коли "
        ]
      },
      "ur": {
        "and": [
          "* ",
          "اور "
        ],
        "background": [
          "پس منظر"
        ],
        "but": [
          "* ",
          "لیکن "
        ],
        "examples": [
          "مثالیں"
        ],
        "feature": [
          "صلاحیت",
          "کاروبار کی ضرورت",
          "خصوصیت"
        ],
        "given": [
          "* ",
          "اگر ",
          "بالفرض ",
          "فرض کیا "
        ],
        "name": "Urdu",
        "native": "اردو",
        "scenario": [
          "منظرنامہ"
        ],
        "scenarioOutline": [
          "منظر نامے کا خاکہ"
        ],
        "then": [
          "* ",
          "پھر ",
          "تب "
        ],
        "when": [
          "* ",
          "جب "
        ]
      },
      "uz": {
        "and": [
          "* ",
          "Ва "
        ],
        "background": [
          "Тарих"
        ],
        "but": [
          "* ",
          "Лекин ",
          "Бирок ",
          "Аммо "
        ],
        "examples": [
          "Мисоллар"
        ],
        "feature": [
          "Функционал"
        ],
        "given": [
          "* ",
          "Агар "
        ],
        "name": "Uzbek",
        "native": "Узбекча",
        "scenario": [
          "Сценарий"
        ],
        "scenarioOutline": [
          "Сценарий структураси"
        ],
        "then": [
          "* ",
          "Унда "
        ],
        "when": [
          "* ",
          "Агар "
        ]
      },
      "vi": {
        "and": [
          "* ",
          "Và "
        ],
        "background": [
          "Bối cảnh"
        ],
        "but": [
          "* ",
          "Nhưng "
        ],
        "examples": [
          "Dữ liệu"
        ],
        "feature": [
          "Tính năng"
        ],
        "given": [
          "* ",
          "Biết ",
          "Cho "
        ],
        "name": "Vietnamese",
        "native": "Tiếng Việt",
        "scenario": [
          "Tình huống",
          "Kịch bản"
        ],
        "scenarioOutline": [
          "Khung tình huống",
          "Khung kịch bản"
        ],
        "then": [
          "* ",
          "Thì "
        ],
        "when": [
          "* ",
          "Khi "
        ]
      },
      "zh-CN": {
        "and": [
          "* ",
          "而且",
          "并且",
          "同时"
        ],
        "background": [
          "背景"
        ],
        "but": [
          "* ",
          "但是"
        ],
        "examples": [
          "例子"
        ],
        "feature": [
          "功能"
        ],
        "given": [
          "* ",
          "假如",
          "假设",
          "假定"
        ],
        "name": "Chinese simplified",
        "native": "简体中文",
        "scenario": [
          "场景",
          "剧本"
        ],
        "scenarioOutline": [
          "场景大纲",
          "剧本大纲"
        ],
        "then": [
          "* ",
          "那么"
        ],
        "when": [
          "* ",
          "当"
        ]
      },
      "zh-TW": {
        "and": [
          "* ",
          "而且",
          "並且",
          "同時"
        ],
        "background": [
          "背景"
        ],
        "but": [
          "* ",
          "但是"
        ],
        "examples": [
          "例子"
        ],
        "feature": [
          "功能"
        ],
        "given": [
          "* ",
          "假如",
          "假設",
          "假定"
        ],
        "name": "Chinese traditional",
        "native": "繁體中文",
        "scenario": [
          "場景",
          "劇本"
        ],
        "scenarioOutline": [
          "場景大綱",
          "劇本大綱"
        ],
        "then": [
          "* ",
          "那麼"
        ],
        "when": [
          "* ",
          "當"
        ]
      }
    };
});

define("ace/mode/gherkin/lib/gherkin/token_matcher",["require","exports","module","ace/mode/gherkin/lib/gherkin/dialects","ace/mode/gherkin/lib/gherkin/errors"], function (require, exports, module) {
    var DIALECTS = require('./dialects');
    var Errors = require('./errors');
    var LANGUAGE_PATTERN = /^\s*#\s*language\s*:\s*([a-zA-Z\-_]+)\s*$/;

    module.exports = function TokenMatcher(defaultDialectName) {
      defaultDialectName = defaultDialectName || 'en';

      var dialect;
      var dialectName;
      var activeDocStringSeparator;
      var indentToRemove;

      function changeDialect(newDialectName, location) {
        var newDialect = DIALECTS[newDialectName];
        if(!newDialect) {
          throw Errors.NoSuchLanguageException.create(newDialectName, location);
        }

        dialectName = newDialectName;
        dialect = newDialect;
      }

      this.reset = function () {
        if(dialectName != defaultDialectName) changeDialect(defaultDialectName);
        activeDocStringSeparator = null;
        indentToRemove = 0;
      };

      this.reset();

      this.match_TagLine = function match_TagLine(token) {
        if(token.line.startsWith('@')) {
          setTokenMatched(token, 'TagLine', null, null, null, token.line.getTags());
          return true;
        }
        return false;
      };

      this.match_FeatureLine = function match_FeatureLine(token) {
        return matchTitleLine(token, 'FeatureLine', dialect.feature);
      };

      this.match_ScenarioLine = function match_ScenarioLine(token) {
        return matchTitleLine(token, 'ScenarioLine', dialect.scenario);
      };

      this.match_ScenarioOutlineLine = function match_ScenarioOutlineLine(token) {
        return matchTitleLine(token, 'ScenarioOutlineLine', dialect.scenarioOutline);
      };

      this.match_BackgroundLine = function match_BackgroundLine(token) {
        return matchTitleLine(token, 'BackgroundLine', dialect.background);
      };

      this.match_ExamplesLine = function match_ExamplesLine(token) {
        return matchTitleLine(token, 'ExamplesLine', dialect.examples);
      };

      this.match_TableRow = function match_TableRow(token) {
        if (token.line.startsWith('|')) {
          setTokenMatched(token, 'TableRow', null, null, null, token.line.getTableCells());
          return true;
        }
        return false;
      };

      this.match_Empty = function match_Empty(token) {
        if (token.line.isEmpty) {
          setTokenMatched(token, 'Empty', null, null, 0);
          return true;
        }
        return false;
      };

      this.match_Comment = function match_Comment(token) {
        if(token.line.startsWith('#')) {
          var text = token.line.getLineText(0); //take the entire line, including leading space
          setTokenMatched(token, 'Comment', text, null, 0);
          return true;
        }
        return false;
      };

      this.match_Language = function match_Language(token) {
        var match;
        if(match = token.line.trimmedLineText.match(LANGUAGE_PATTERN)) {
          var newDialectName = match[1];
          setTokenMatched(token, 'Language', newDialectName);

          changeDialect(newDialectName, token.location);
          return true;
        }
        return false;
      };

      this.match_DocStringSeparator = function match_DocStringSeparator(token) {
        return activeDocStringSeparator == null
          ?
          _match_DocStringSeparator(token, '"""', true) ||
          _match_DocStringSeparator(token, '```', true)
          :
          _match_DocStringSeparator(token, activeDocStringSeparator, false);
      };

      function _match_DocStringSeparator(token, separator, isOpen) {
        if (token.line.startsWith(separator)) {
          var contentType = null;
          if (isOpen) {
            contentType = token.line.getRestTrimmed(separator.length);
            activeDocStringSeparator = separator;
            indentToRemove = token.line.indent;
          } else {
            activeDocStringSeparator = null;
            indentToRemove = 0;
          }
          setTokenMatched(token, 'DocStringSeparator', contentType);
          return true;
        }
        return false;
      }

      this.match_EOF = function match_EOF(token) {
        if(token.isEof) {
          setTokenMatched(token, 'EOF');
          return true;
        }
        return false;
      };

      this.match_StepLine = function match_StepLine(token) {
        var keywords = []
          .concat(dialect.given)
          .concat(dialect.when)
          .concat(dialect.then)
          .concat(dialect.and)
          .concat(dialect.but);
        var length = keywords.length;
        for(var i = 0, keyword; i < length; i++) {
          var keyword = keywords[i];

          if (token.line.startsWith(keyword)) {
            var title = token.line.getRestTrimmed(keyword.length);
            setTokenMatched(token, 'StepLine', title, keyword);
            return true;
          }
        }
        return false;
      };

      this.match_Other = function match_Other(token) {
        var text = token.line.getLineText(indentToRemove); //take the entire line, except removing DocString indents
        setTokenMatched(token, 'Other', unescapeDocString(text), null, 0);
        return true;
      };

      function matchTitleLine(token, tokenType, keywords) {
        var length = keywords.length;
        for(var i = 0, keyword; i < length; i++) {
          var keyword = keywords[i];

          if (token.line.startsWithTitleKeyword(keyword)) {
            var title = token.line.getRestTrimmed(keyword.length + ':'.length);
            setTokenMatched(token, tokenType, title, keyword);
            return true;
          }
        }
        return false;
      }

      function setTokenMatched(token, matchedType, text, keyword, indent, items) {
        token.matchedType = matchedType;
        token.matchedText = text;
        token.matchedKeyword = keyword;
        token.matchedIndent = (typeof indent === 'number') ? indent : (token.line == null ? 0 : token.line.indent);
        token.matchedItems = items || [];

        token.location.column = token.matchedIndent + 1;
        token.matchedGherkinDialect = dialectName;
      }

      function unescapeDocString(text) {
        return activeDocStringSeparator != null ? text.replace("\\\"\\\"\\\"", "\"\"\"") : text;
      }
    };
});

define("ace/mode/gherkin/lib/gherkin/parser",["require","exports","module","ace/mode/gherkin/lib/gherkin/errors","ace/mode/gherkin/lib/gherkin/ast_builder","ace/mode/gherkin/lib/gherkin/token_scanner","ace/mode/gherkin/lib/gherkin/token_matcher"], function (require, exports, module) {
    var Errors = require('./errors');
    var AstBuilder = require('./ast_builder');
    var TokenScanner = require('./token_scanner');
    var TokenMatcher = require('./token_matcher');

    var RULE_TYPES = [
      'None',
      '_EOF', // #EOF
      '_Empty', // #Empty
      '_Comment', // #Comment
      '_TagLine', // #TagLine
      '_FeatureLine', // #FeatureLine
      '_BackgroundLine', // #BackgroundLine
      '_ScenarioLine', // #ScenarioLine
      '_ScenarioOutlineLine', // #ScenarioOutlineLine
      '_ExamplesLine', // #ExamplesLine
      '_StepLine', // #StepLine
      '_DocStringSeparator', // #DocStringSeparator
      '_TableRow', // #TableRow
      '_Language', // #Language
      '_Other', // #Other
      'GherkinDocument', // GherkinDocument! := Feature?
      'Feature', // Feature! := Feature_Header Background? Scenario_Definition*
      'Feature_Header', // Feature_Header! := #Language? Tags? #FeatureLine Feature_Description
      'Background', // Background! := #BackgroundLine Background_Description Scenario_Step*
      'Scenario_Definition', // Scenario_Definition! := Tags? (Scenario | ScenarioOutline)
      'Scenario', // Scenario! := #ScenarioLine Scenario_Description Scenario_Step*
      'ScenarioOutline', // ScenarioOutline! := #ScenarioOutlineLine ScenarioOutline_Description ScenarioOutline_Step* Examples_Definition*
      'Examples_Definition', // Examples_Definition! [#Empty|#Comment|#TagLine-&gt;#ExamplesLine] := Tags? Examples
      'Examples', // Examples! := #ExamplesLine Examples_Description Examples_Table?
      'Examples_Table', // Examples_Table! := #TableRow #TableRow*
      'Scenario_Step', // Scenario_Step := Step
      'ScenarioOutline_Step', // ScenarioOutline_Step := Step
      'Step', // Step! := #StepLine Step_Arg?
      'Step_Arg', // Step_Arg := (DataTable | DocString)
      'DataTable', // DataTable! := #TableRow+
      'DocString', // DocString! := #DocStringSeparator #Other* #DocStringSeparator
      'Tags', // Tags! := #TagLine+
      'Feature_Description', // Feature_Description := Description_Helper
      'Background_Description', // Background_Description := Description_Helper
      'Scenario_Description', // Scenario_Description := Description_Helper
      'ScenarioOutline_Description', // ScenarioOutline_Description := Description_Helper
      'Examples_Description', // Examples_Description := Description_Helper
      'Description_Helper', // Description_Helper := #Empty* Description? #Comment*
      'Description', // Description! := #Other+
    ];

    module.exports = function Parser(builder) {
      builder = builder || new AstBuilder();
      var self = this;
      var context;

      this.parse = function(tokenScanner, tokenMatcher) {
        if(typeof tokenScanner == 'string') {
          tokenScanner = new TokenScanner(tokenScanner);
        }
        tokenMatcher = tokenMatcher || new TokenMatcher();
        builder.reset();
        tokenMatcher.reset();
        context = {
          tokenScanner: tokenScanner,
          tokenMatcher: tokenMatcher,
          tokenQueue: [],
          errors: []
        };
        startRule(context, "GherkinDocument");
        var state = 0;
        var token = null;
        while(true) {
          token = readToken(context);
          state = matchToken(state, token, context);
          if(token.isEof) break;
        }

        endRule(context, "GherkinDocument");

        if(context.errors.length > 0) {
          throw Errors.CompositeParserException.create(context.errors);
        }

        return getResult();
      };

      function addError(context, error) {
        context.errors.push(error);
        if (context.errors.length > 10)
          throw Errors.CompositeParserException.create(context.errors);
      }

      function startRule(context, ruleType) {
        handleAstError(context, function () {
          builder.startRule(ruleType);
        });
      }

      function endRule(context, ruleType) {
        handleAstError(context, function () {
          builder.endRule(ruleType);
        });
      }

      function build(context, token) {
        handleAstError(context, function () {
          builder.build(token);
        });
      }

      function getResult() {
        return builder.getResult();
      }

      function handleAstError(context, action) {
        handleExternalError(context, true, action)
      }

      function handleExternalError(context, defaultValue, action) {
        if(self.stopAtFirstError) return action();
        try {
          return action();
        } catch (e) {
          if(e instanceof Errors.CompositeParserException) {
            e.errors.forEach(function (error) {
              addError(context, error);
            });
          } else if(
            e instanceof Errors.ParserException ||
            e instanceof Errors.AstBuilderException ||
            e instanceof Errors.UnexpectedTokenException ||
            e instanceof Errors.NoSuchLanguageException
          ) {
            addError(context, e);
          } else {
            throw e;
          }
        }
        return defaultValue;
      }

      function readToken(context) {
        return context.tokenQueue.length > 0 ?
          context.tokenQueue.shift() :
          context.tokenScanner.read();
      }

      function matchToken(state, token, context) {
        switch(state) {
        case 0:
          return matchTokenAt_0(token, context);
        case 1:
          return matchTokenAt_1(token, context);
        case 2:
          return matchTokenAt_2(token, context);
        case 3:
          return matchTokenAt_3(token, context);
        case 4:
          return matchTokenAt_4(token, context);
        case 5:
          return matchTokenAt_5(token, context);
        case 6:
          return matchTokenAt_6(token, context);
        case 7:
          return matchTokenAt_7(token, context);
        case 8:
          return matchTokenAt_8(token, context);
        case 9:
          return matchTokenAt_9(token, context);
        case 10:
          return matchTokenAt_10(token, context);
        case 11:
          return matchTokenAt_11(token, context);
        case 12:
          return matchTokenAt_12(token, context);
        case 13:
          return matchTokenAt_13(token, context);
        case 14:
          return matchTokenAt_14(token, context);
        case 15:
          return matchTokenAt_15(token, context);
        case 16:
          return matchTokenAt_16(token, context);
        case 17:
          return matchTokenAt_17(token, context);
        case 18:
          return matchTokenAt_18(token, context);
        case 19:
          return matchTokenAt_19(token, context);
        case 20:
          return matchTokenAt_20(token, context);
        case 21:
          return matchTokenAt_21(token, context);
        case 22:
          return matchTokenAt_22(token, context);
        case 23:
          return matchTokenAt_23(token, context);
        case 24:
          return matchTokenAt_24(token, context);
        case 25:
          return matchTokenAt_25(token, context);
        case 26:
          return matchTokenAt_26(token, context);
        case 28:
          return matchTokenAt_28(token, context);
        case 29:
          return matchTokenAt_29(token, context);
        case 30:
          return matchTokenAt_30(token, context);
        case 31:
          return matchTokenAt_31(token, context);
        case 32:
          return matchTokenAt_32(token, context);
        case 33:
          return matchTokenAt_33(token, context);
        default:
          throw new Error("Unknown state: " + state);
        }
      }
      function matchTokenAt_0(token, context) {
        if(match_EOF(context, token)) {
          build(context, token);
          return 27;
        }
        if(match_Language(context, token)) {
          startRule(context, 'Feature');
          startRule(context, 'Feature_Header');
          build(context, token);
          return 1;
        }
        if(match_TagLine(context, token)) {
          startRule(context, 'Feature');
          startRule(context, 'Feature_Header');
          startRule(context, 'Tags');
          build(context, token);
          return 2;
        }
        if(match_FeatureLine(context, token)) {
          startRule(context, 'Feature');
          startRule(context, 'Feature_Header');
          build(context, token);
          return 3;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 0;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 0;
        }

        var stateComment = "State: 0 - Start";
        token.detach();
        var expectedTokens = ["#EOF", "#Language", "#TagLine", "#FeatureLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 0;
      }
      function matchTokenAt_1(token, context) {
        if(match_TagLine(context, token)) {
          startRule(context, 'Tags');
          build(context, token);
          return 2;
        }
        if(match_FeatureLine(context, token)) {
          build(context, token);
          return 3;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 1;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 1;
        }

        var stateComment = "State: 1 - GherkinDocument:0>Feature:0>Feature_Header:0>#Language:0";
        token.detach();
        var expectedTokens = ["#TagLine", "#FeatureLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 1;
      }
      function matchTokenAt_2(token, context) {
        if(match_TagLine(context, token)) {
          build(context, token);
          return 2;
        }
        if(match_FeatureLine(context, token)) {
          endRule(context, 'Tags');
          build(context, token);
          return 3;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 2;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 2;
        }

        var stateComment = "State: 2 - GherkinDocument:0>Feature:0>Feature_Header:1>Tags:0>#TagLine:0";
        token.detach();
        var expectedTokens = ["#TagLine", "#FeatureLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 2;
      }
      function matchTokenAt_3(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Feature_Header');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 3;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 5;
        }
        if(match_BackgroundLine(context, token)) {
          endRule(context, 'Feature_Header');
          startRule(context, 'Background');
          build(context, token);
          return 6;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          startRule(context, 'Description');
          build(context, token);
          return 4;
        }

        var stateComment = "State: 3 - GherkinDocument:0>Feature:0>Feature_Header:2>#FeatureLine:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Empty", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 3;
      }
      function matchTokenAt_4(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Feature_Header');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          endRule(context, 'Description');
          build(context, token);
          return 5;
        }
        if(match_BackgroundLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Feature_Header');
          startRule(context, 'Background');
          build(context, token);
          return 6;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          build(context, token);
          return 4;
        }

        var stateComment = "State: 4 - GherkinDocument:0>Feature:0>Feature_Header:3>Feature_Description:0>Description_Helper:1>Description:0>#Other:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 4;
      }
      function matchTokenAt_5(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Feature_Header');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 5;
        }
        if(match_BackgroundLine(context, token)) {
          endRule(context, 'Feature_Header');
          startRule(context, 'Background');
          build(context, token);
          return 6;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Feature_Header');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 5;
        }

        var stateComment = "State: 5 - GherkinDocument:0>Feature:0>Feature_Header:3>Feature_Description:0>Description_Helper:2>#Comment:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 5;
      }
      function matchTokenAt_6(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Background');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 6;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 8;
        }
        if(match_StepLine(context, token)) {
          startRule(context, 'Step');
          build(context, token);
          return 9;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          startRule(context, 'Description');
          build(context, token);
          return 7;
        }

        var stateComment = "State: 6 - GherkinDocument:0>Feature:1>Background:0>#BackgroundLine:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 6;
      }
      function matchTokenAt_7(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Background');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          endRule(context, 'Description');
          build(context, token);
          return 8;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'Description');
          startRule(context, 'Step');
          build(context, token);
          return 9;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          build(context, token);
          return 7;
        }

        var stateComment = "State: 7 - GherkinDocument:0>Feature:1>Background:1>Background_Description:0>Description_Helper:1>Description:0>#Other:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 7;
      }
      function matchTokenAt_8(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Background');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 8;
        }
        if(match_StepLine(context, token)) {
          startRule(context, 'Step');
          build(context, token);
          return 9;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 8;
        }

        var stateComment = "State: 8 - GherkinDocument:0>Feature:1>Background:1>Background_Description:0>Description_Helper:2>#Comment:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 8;
      }
      function matchTokenAt_9(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'Background');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_TableRow(context, token)) {
          startRule(context, 'DataTable');
          build(context, token);
          return 10;
        }
        if(match_DocStringSeparator(context, token)) {
          startRule(context, 'DocString');
          build(context, token);
          return 32;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 9;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 9;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 9;
        }

        var stateComment = "State: 9 - GherkinDocument:0>Feature:1>Background:2>Scenario_Step:0>Step:0>#StepLine:0";
        token.detach();
        var expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 9;
      }
      function matchTokenAt_10(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'Background');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_TableRow(context, token)) {
          build(context, token);
          return 10;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 9;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 10;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 10;
        }

        var stateComment = "State: 10 - GherkinDocument:0>Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0";
        token.detach();
        var expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 10;
      }
      function matchTokenAt_11(token, context) {
        if(match_TagLine(context, token)) {
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Tags');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Tags');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 11;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 11;
        }

        var stateComment = "State: 11 - GherkinDocument:0>Feature:2>Scenario_Definition:0>Tags:0>#TagLine:0";
        token.detach();
        var expectedTokens = ["#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 11;
      }
      function matchTokenAt_12(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 12;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 14;
        }
        if(match_StepLine(context, token)) {
          startRule(context, 'Step');
          build(context, token);
          return 15;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          startRule(context, 'Description');
          build(context, token);
          return 13;
        }

        var stateComment = "State: 12 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:0>Scenario:0>#ScenarioLine:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 12;
      }
      function matchTokenAt_13(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          endRule(context, 'Description');
          build(context, token);
          return 14;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'Description');
          startRule(context, 'Step');
          build(context, token);
          return 15;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          build(context, token);
          return 13;
        }

        var stateComment = "State: 13 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:0>Scenario:1>Scenario_Description:0>Description_Helper:1>Description:0>#Other:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 13;
      }
      function matchTokenAt_14(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 14;
        }
        if(match_StepLine(context, token)) {
          startRule(context, 'Step');
          build(context, token);
          return 15;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 14;
        }

        var stateComment = "State: 14 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:0>Scenario:1>Scenario_Description:0>Description_Helper:2>#Comment:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 14;
      }
      function matchTokenAt_15(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_TableRow(context, token)) {
          startRule(context, 'DataTable');
          build(context, token);
          return 16;
        }
        if(match_DocStringSeparator(context, token)) {
          startRule(context, 'DocString');
          build(context, token);
          return 30;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 15;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 15;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 15;
        }

        var stateComment = "State: 15 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:0>#StepLine:0";
        token.detach();
        var expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 15;
      }
      function matchTokenAt_16(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_TableRow(context, token)) {
          build(context, token);
          return 16;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 15;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 16;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 16;
        }

        var stateComment = "State: 16 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0";
        token.detach();
        var expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 16;
      }
      function matchTokenAt_17(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 19;
        }
        if(match_StepLine(context, token)) {
          startRule(context, 'Step');
          build(context, token);
          return 20;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          startRule(context, 'Description');
          build(context, token);
          return 18;
        }

        var stateComment = "State: 17 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:0>#ScenarioOutlineLine:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 17;
      }
      function matchTokenAt_18(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          endRule(context, 'Description');
          build(context, token);
          return 19;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'Description');
          startRule(context, 'Step');
          build(context, token);
          return 20;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          endRule(context, 'Description');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'Description');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          build(context, token);
          return 18;
        }

        var stateComment = "State: 18 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:1>ScenarioOutline_Description:0>Description_Helper:1>Description:0>#Other:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 18;
      }
      function matchTokenAt_19(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 19;
        }
        if(match_StepLine(context, token)) {
          startRule(context, 'Step');
          build(context, token);
          return 20;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 19;
        }

        var stateComment = "State: 19 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:1>ScenarioOutline_Description:0>Description_Helper:2>#Comment:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 19;
      }
      function matchTokenAt_20(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_TableRow(context, token)) {
          startRule(context, 'DataTable');
          build(context, token);
          return 21;
        }
        if(match_DocStringSeparator(context, token)) {
          startRule(context, 'DocString');
          build(context, token);
          return 28;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 20;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          endRule(context, 'Step');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'Step');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 20;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 20;
        }

        var stateComment = "State: 20 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:0>#StepLine:0";
        token.detach();
        var expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 20;
      }
      function matchTokenAt_21(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_TableRow(context, token)) {
          build(context, token);
          return 21;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 20;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'DataTable');
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 21;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 21;
        }

        var stateComment = "State: 21 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0";
        token.detach();
        var expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 21;
      }
      function matchTokenAt_22(token, context) {
        if(match_TagLine(context, token)) {
          build(context, token);
          return 22;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'Tags');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 22;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 22;
        }

        var stateComment = "State: 22 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:0>Tags:0>#TagLine:0";
        token.detach();
        var expectedTokens = ["#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 22;
      }
      function matchTokenAt_23(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 23;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 25;
        }
        if(match_TableRow(context, token)) {
          startRule(context, 'Examples_Table');
          build(context, token);
          return 26;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          startRule(context, 'Description');
          build(context, token);
          return 24;
        }

        var stateComment = "State: 23 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:0>#ExamplesLine:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Empty", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 23;
      }
      function matchTokenAt_24(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          endRule(context, 'Description');
          build(context, token);
          return 25;
        }
        if(match_TableRow(context, token)) {
          endRule(context, 'Description');
          startRule(context, 'Examples_Table');
          build(context, token);
          return 26;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Description');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Other(context, token)) {
          build(context, token);
          return 24;
        }

        var stateComment = "State: 24 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:1>Examples_Description:0>Description_Helper:1>Description:0>#Other:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 24;
      }
      function matchTokenAt_25(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 25;
        }
        if(match_TableRow(context, token)) {
          startRule(context, 'Examples_Table');
          build(context, token);
          return 26;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 25;
        }

        var stateComment = "State: 25 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:1>Examples_Description:0>Description_Helper:2>#Comment:0";
        token.detach();
        var expectedTokens = ["#EOF", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 25;
      }
      function matchTokenAt_26(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'Examples_Table');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_TableRow(context, token)) {
          build(context, token);
          return 26;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          endRule(context, 'Examples_Table');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'Examples_Table');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'Examples_Table');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'Examples_Table');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'Examples_Table');
          endRule(context, 'Examples');
          endRule(context, 'Examples_Definition');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 26;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 26;
        }

        var stateComment = "State: 26 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:2>Examples_Table:0>#TableRow:0";
        token.detach();
        var expectedTokens = ["#EOF", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 26;
      }
      function matchTokenAt_28(token, context) {
        if(match_DocStringSeparator(context, token)) {
          build(context, token);
          return 29;
        }
        if(match_Other(context, token)) {
          build(context, token);
          return 28;
        }

        var stateComment = "State: 28 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0";
        token.detach();
        var expectedTokens = ["#DocStringSeparator", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 28;
      }
      function matchTokenAt_29(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 20;
        }
        if(match_TagLine(context, token)) {
          if(lookahead_0(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 22;
          }
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ExamplesLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          startRule(context, 'Examples_Definition');
          startRule(context, 'Examples');
          build(context, token);
          return 23;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'ScenarioOutline');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 29;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 29;
        }

        var stateComment = "State: 29 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0";
        token.detach();
        var expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 29;
      }
      function matchTokenAt_30(token, context) {
        if(match_DocStringSeparator(context, token)) {
          build(context, token);
          return 31;
        }
        if(match_Other(context, token)) {
          build(context, token);
          return 30;
        }

        var stateComment = "State: 30 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0";
        token.detach();
        var expectedTokens = ["#DocStringSeparator", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 30;
      }
      function matchTokenAt_31(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 15;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'Scenario');
          endRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 31;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 31;
        }

        var stateComment = "State: 31 - GherkinDocument:0>Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0";
        token.detach();
        var expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 31;
      }
      function matchTokenAt_32(token, context) {
        if(match_DocStringSeparator(context, token)) {
          build(context, token);
          return 33;
        }
        if(match_Other(context, token)) {
          build(context, token);
          return 32;
        }

        var stateComment = "State: 32 - GherkinDocument:0>Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0";
        token.detach();
        var expectedTokens = ["#DocStringSeparator", "#Other"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 32;
      }
      function matchTokenAt_33(token, context) {
        if(match_EOF(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'Background');
          endRule(context, 'Feature');
          build(context, token);
          return 27;
        }
        if(match_StepLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          startRule(context, 'Step');
          build(context, token);
          return 9;
        }
        if(match_TagLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Tags');
          build(context, token);
          return 11;
        }
        if(match_ScenarioLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'Scenario');
          build(context, token);
          return 12;
        }
        if(match_ScenarioOutlineLine(context, token)) {
          endRule(context, 'DocString');
          endRule(context, 'Step');
          endRule(context, 'Background');
          startRule(context, 'Scenario_Definition');
          startRule(context, 'ScenarioOutline');
          build(context, token);
          return 17;
        }
        if(match_Comment(context, token)) {
          build(context, token);
          return 33;
        }
        if(match_Empty(context, token)) {
          build(context, token);
          return 33;
        }

        var stateComment = "State: 33 - GherkinDocument:0>Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0";
        token.detach();
        var expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
        var error = token.isEof ?
          Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
          Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
        if (self.stopAtFirstError) throw error;
        addError(context, error);
        return 33;
      }



      function match_EOF(context, token) {
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_EOF(token);
        });
      }


      function match_Empty(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_Empty(token);
        });
      }


      function match_Comment(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_Comment(token);
        });
      }


      function match_TagLine(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_TagLine(token);
        });
      }


      function match_FeatureLine(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_FeatureLine(token);
        });
      }


      function match_BackgroundLine(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_BackgroundLine(token);
        });
      }


      function match_ScenarioLine(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_ScenarioLine(token);
        });
      }


      function match_ScenarioOutlineLine(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_ScenarioOutlineLine(token);
        });
      }


      function match_ExamplesLine(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_ExamplesLine(token);
        });
      }


      function match_StepLine(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_StepLine(token);
        });
      }


      function match_DocStringSeparator(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_DocStringSeparator(token);
        });
      }


      function match_TableRow(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_TableRow(token);
        });
      }


      function match_Language(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_Language(token);
        });
      }


      function match_Other(context, token) {
        if(token.isEof) return false;
        return handleExternalError(context, false, function () {
          return context.tokenMatcher.match_Other(token);
        });
      }



      function lookahead_0(context, currentToken) {
        currentToken.detach();
        var token;
        var queue = [];
        var match = false;
        do {
          token = readToken(context);
          token.detach();
          queue.push(token);

          if (false  || match_ExamplesLine(context, token)) {
            match = true;
            break;
          }
        } while(false  || match_Empty(context, token) || match_Comment(context, token) || match_TagLine(context, token));

        context.tokenQueue = context.tokenQueue.concat(queue);

        return match;
      }


    }
});

define("ace/mode/gherkin/lib/gherkin/pickles/compiler",["require","exports","module","ace/mode/gherkin/lib/gherkin/count_symbols"], function (require, exports, module) {
    var countSymbols = require('../count_symbols');

    function Compiler() {
      this.compile = function (gherkin_document) {
        var pickles = [];

        if (gherkin_document.feature == null) return pickles;

        var feature = gherkin_document.feature;
        var language = feature.language;
        var featureTags = feature.tags;
        var backgroundSteps = [];

        feature.children.forEach(function (scenarioDefinition) {
          if(scenarioDefinition.type === 'Background') {
            backgroundSteps = pickleSteps(scenarioDefinition);
          } else if(scenarioDefinition.type === 'Scenario') {
            compileScenario(featureTags, backgroundSteps, scenarioDefinition, language, pickles);
          } else {
            compileScenarioOutline(featureTags, backgroundSteps, scenarioDefinition, language, pickles);
          }
        });
        return pickles;
      };

      function compileScenario(featureTags, backgroundSteps, scenario, language, pickles) {
        if (scenario.steps.length == 0) return;

        var steps = [].concat(backgroundSteps);

        var tags = [].concat(featureTags).concat(scenario.tags);

        scenario.steps.forEach(function (step) {
          steps.push(pickleStep(step));
        });

        var pickle = {
          tags: pickleTags(tags),
          name: scenario.name,
          language: language,
          locations: [pickleLocation(scenario.location)],
          steps: steps
        };
        pickles.push(pickle);
      }

      function compileScenarioOutline(featureTags, backgroundSteps, scenarioOutline, language, pickles) {
        if (scenarioOutline.steps.length == 0) return;

        scenarioOutline.examples.filter(function(e) { return e.tableHeader != undefined; }).forEach(function (examples) {
          var variableCells = examples.tableHeader.cells;
          examples.tableBody.forEach(function (values) {
            var valueCells = values.cells;
            var steps = [].concat(backgroundSteps);
            var tags = [].concat(featureTags).concat(scenarioOutline.tags).concat(examples.tags);

            scenarioOutline.steps.forEach(function (scenarioOutlineStep) {
              var stepText = interpolate(scenarioOutlineStep.text, variableCells, valueCells);
              var args = createPickleArguments(scenarioOutlineStep.argument, variableCells, valueCells);
              var pickleStep = {
                text: stepText,
                arguments: args,
                locations: [
                  pickleLocation(values.location),
                  pickleStepLocation(scenarioOutlineStep)
                ]
              };
              steps.push(pickleStep);
            });

            var pickle = {
              name: interpolate(scenarioOutline.name, variableCells, valueCells),
              language: language,
              steps: steps,
              tags: pickleTags(tags),
              locations: [
                pickleLocation(values.location),
                pickleLocation(scenarioOutline.location)
              ]
            };
            pickles.push(pickle);

          });
        });
      }

      function createPickleArguments(argument, variableCells, valueCells) {
        var result = [];
        if (!argument) return result;
        if (argument.type === 'DataTable') {
          var table = {
            rows: argument.rows.map(function (row) {
              return {
                cells: row.cells.map(function (cell) {
                  return {
                    location: pickleLocation(cell.location),
                    value: interpolate(cell.value, variableCells, valueCells)
                  };
                })
              };
            })
          };
          result.push(table);
        } else if (argument.type === 'DocString') {
          var docString = {
            location: pickleLocation(argument.location),
            content: interpolate(argument.content, variableCells, valueCells)
          };
          result.push(docString);
        } else {
          throw Error('Internal error');
        }
        return result;
      }

      function interpolate(name, variableCells, valueCells) {
        variableCells.forEach(function (variableCell, n) {
          var valueCell = valueCells[n];
          var search = new RegExp('<' + variableCell.value + '>', 'g');
          name = name.replace(search, valueCell.value);
        });
        return name;
      }

      function pickleSteps(scenarioDefinition) {
        return scenarioDefinition.steps.map(function (step) {
          return pickleStep(step);
        });
      }

      function pickleStep(step) {
        return {
          text: step.text,
          arguments: createPickleArguments(step.argument, [], []),
          locations: [pickleStepLocation(step)]
        }
      }

      function pickleStepLocation(step) {
        return {
          line: step.location.line,
          column: step.location.column + (step.keyword ? countSymbols(step.keyword) : 0)
        };
      }

      function pickleLocation(location) {
        return {
          line: location.line,
          column: location.column
        }
      }

      function pickleTags(tags) {
        return tags.map(function (tag) {
          return pickleTag(tag);
        });
      }

      function pickleTag(tag) {
        return {
          name: tag.name,
          location: pickleLocation(tag.location)
        };
      }
    }

    module.exports = Compiler;
});

define("ace/mode/gherkin/lib/gherkin/generate_events",["require","exports","module","ace/mode/gherkin/lib/gherkin/parser","ace/mode/gherkin/lib/gherkin/pickles/compiler"], function (require, exports, module) {
    var Parser = require('./parser')
    var Compiler = require('./pickles/compiler')

    var compiler = new Compiler()
    var parser = new Parser()
    parser.stopAtFirstError = false

    function generateEvents(data, uri, types) {
      types = Object.assign({
        'source': true,
        'gherkin-document': true,
        'pickle': true
      }, types || {})

      result = []

      try {
        if (types['source']) {
          result.push({
            type: 'source',
            uri: uri,
            data: data,
            media: {
              encoding: 'utf-8',
              type: 'text/vnd.cucumber.gherkin+plain'
            }
          })
        }

        if (!types['gherkin-document'] && !types['pickle'])
          return result

        var gherkinDocument = parser.parse(data)

        if (types['gherkin-document']) {
          result.push({
            type: 'gherkin-document',
            uri: uri,
            document: gherkinDocument
          })
        }

        if (types['pickle']) {
          var pickles = compiler.compile(gherkinDocument)
          for (var p in pickles) {
            result.push({
              type: 'pickle',
              uri: uri,
              pickle: pickles[p]
            })
          }
        }
      } catch (err) {
        var errors = err.errors || [err]
        for (var e in errors) {
          result.push({
            type: "attachment",
            source: {
              uri: uri,
              start: {
                line: errors[e].location.line,
                column: errors[e].location.column
              }
            },
            data: errors[e].message,
            media: {
              encoding: "utf-8",
              type: "text/vnd.cucumber.stacktrace+plain"
            }
          })
        }
      }
      return result
    }

    module.exports = generateEvents
});

define("ace/mode/gherkin/gherkin",["require","exports","module","ace/mode/gherkin/lib/gherkin/parser","ace/mode/gherkin/lib/gherkin/token_scanner","ace/mode/gherkin/lib/gherkin/token_matcher","ace/mode/gherkin/lib/gherkin/ast_builder","ace/mode/gherkin/lib/gherkin/pickles/compiler","ace/mode/gherkin/lib/gherkin/dialects","ace/mode/gherkin/lib/gherkin/generate_events"], function (require, exports, module) {
  module.exports = {
    Parser: require('./lib/gherkin/parser'),
    TokenScanner: require('./lib/gherkin/token_scanner'),
    TokenMatcher: require('./lib/gherkin/token_matcher'),
    AstBuilder: require('./lib/gherkin/ast_builder'),
    Compiler: require('./lib/gherkin/pickles/compiler'),
    DIALECTS: require('./lib/gherkin/dialects'),
    generateEvents: require('./lib/gherkin/generate_events')
  };
});

define("ace/mode/gherkin_worker",["require","exports","module","ace/lib/oop","ace/worker/mirror","ace/mode/gherkin/gherkin"], function(require, exports, module) {
  "use strict";

  var oop = require('ace/lib/oop');
  var Mirror = require('ace/worker/mirror').Mirror;
  var lint = require('./gherkin/gherkin');

  lint.stopAtFirstError = false;

  var GherkinWorker = exports.GherkinWorker = function(sender) {
    Mirror.call(this, sender);
    this.setTimeout(500);
    this.setOptions();
  };

  oop.inherits(GherkinWorker, Mirror);

  (function() {
    this.onUpdate = function() {
      var value = this.doc.getValue();

      try {
        lint(value);
      } catch(e) {
        var errors = e.errors.map(function(error) {
          return {
            row: error.location.line - 1, // must be 0 based
            column: error.location.column - 1,
            text: error.message,
            type: 'error'
          };
        });

        this.sender.emit('lint', errors);
      }
    };
  }).call(GherkinWorker.prototype);
});

define("ace/lib/es5-shim",["require","exports","module"], function(require, exports, module) {

function Empty() {}

if (!Function.prototype.bind) {
    Function.prototype.bind = function bind(that) { // .length is 1
        var target = this;
        if (typeof target != "function") {
            throw new TypeError("Function.prototype.bind called on incompatible " + target);
        }
        var args = slice.call(arguments, 1); // for normal call
        var bound = function () {

            if (this instanceof bound) {

                var result = target.apply(
                    this,
                    args.concat(slice.call(arguments))
                );
                if (Object(result) === result) {
                    return result;
                }
                return this;

            } else {
                return target.apply(
                    that,
                    args.concat(slice.call(arguments))
                );

            }

        };
        if(target.prototype) {
            Empty.prototype = target.prototype;
            bound.prototype = new Empty();
            Empty.prototype = null;
        }
        return bound;
    };
}
var call = Function.prototype.call;
var prototypeOfArray = Array.prototype;
var prototypeOfObject = Object.prototype;
var slice = prototypeOfArray.slice;
var _toString = call.bind(prototypeOfObject.toString);
var owns = call.bind(prototypeOfObject.hasOwnProperty);
var defineGetter;
var defineSetter;
var lookupGetter;
var lookupSetter;
var supportsAccessors;
if ((supportsAccessors = owns(prototypeOfObject, "__defineGetter__"))) {
    defineGetter = call.bind(prototypeOfObject.__defineGetter__);
    defineSetter = call.bind(prototypeOfObject.__defineSetter__);
    lookupGetter = call.bind(prototypeOfObject.__lookupGetter__);
    lookupSetter = call.bind(prototypeOfObject.__lookupSetter__);
}
if ([1,2].splice(0).length != 2) {
    if(function() { // test IE < 9 to splice bug - see issue #138
        function makeArray(l) {
            var a = new Array(l+2);
            a[0] = a[1] = 0;
            return a;
        }
        var array = [], lengthBefore;
        
        array.splice.apply(array, makeArray(20));
        array.splice.apply(array, makeArray(26));

        lengthBefore = array.length; //46
        array.splice(5, 0, "XXX"); // add one element

        lengthBefore + 1 == array.length

        if (lengthBefore + 1 == array.length) {
            return true;// has right splice implementation without bugs
        }
    }()) {//IE 6/7
        var array_splice = Array.prototype.splice;
        Array.prototype.splice = function(start, deleteCount) {
            if (!arguments.length) {
                return [];
            } else {
                return array_splice.apply(this, [
                    start === void 0 ? 0 : start,
                    deleteCount === void 0 ? (this.length - start) : deleteCount
                ].concat(slice.call(arguments, 2)))
            }
        };
    } else {//IE8
        Array.prototype.splice = function(pos, removeCount){
            var length = this.length;
            if (pos > 0) {
                if (pos > length)
                    pos = length;
            } else if (pos == void 0) {
                pos = 0;
            } else if (pos < 0) {
                pos = Math.max(length + pos, 0);
            }

            if (!(pos+removeCount < length))
                removeCount = length - pos;

            var removed = this.slice(pos, pos+removeCount);
            var insert = slice.call(arguments, 2);
            var add = insert.length;            
            if (pos === length) {
                if (add) {
                    this.push.apply(this, insert);
                }
            } else {
                var remove = Math.min(removeCount, length - pos);
                var tailOldPos = pos + remove;
                var tailNewPos = tailOldPos + add - remove;
                var tailCount = length - tailOldPos;
                var lengthAfterRemove = length - remove;

                if (tailNewPos < tailOldPos) { // case A
                    for (var i = 0; i < tailCount; ++i) {
                        this[tailNewPos+i] = this[tailOldPos+i];
                    }
                } else if (tailNewPos > tailOldPos) { // case B
                    for (i = tailCount; i--; ) {
                        this[tailNewPos+i] = this[tailOldPos+i];
                    }
                } // else, add == remove (nothing to do)

                if (add && pos === lengthAfterRemove) {
                    this.length = lengthAfterRemove; // truncate array
                    this.push.apply(this, insert);
                } else {
                    this.length = lengthAfterRemove + add; // reserves space
                    for (i = 0; i < add; ++i) {
                        this[pos+i] = insert[i];
                    }
                }
            }
            return removed;
        };
    }
}
if (!Array.isArray) {
    Array.isArray = function isArray(obj) {
        return _toString(obj) == "[object Array]";
    };
}
var boxedString = Object("a"),
    splitString = boxedString[0] != "a" || !(0 in boxedString);

if (!Array.prototype.forEach) {
    Array.prototype.forEach = function forEach(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            thisp = arguments[1],
            i = -1,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        while (++i < length) {
            if (i in self) {
                fun.call(thisp, self[i], i, object);
            }
        }
    };
}
if (!Array.prototype.map) {
    Array.prototype.map = function map(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            result = Array(length),
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self)
                result[i] = fun.call(thisp, self[i], i, object);
        }
        return result;
    };
}
if (!Array.prototype.filter) {
    Array.prototype.filter = function filter(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                    object,
            length = self.length >>> 0,
            result = [],
            value,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self) {
                value = self[i];
                if (fun.call(thisp, value, i, object)) {
                    result.push(value);
                }
            }
        }
        return result;
    };
}
if (!Array.prototype.every) {
    Array.prototype.every = function every(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && !fun.call(thisp, self[i], i, object)) {
                return false;
            }
        }
        return true;
    };
}
if (!Array.prototype.some) {
    Array.prototype.some = function some(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && fun.call(thisp, self[i], i, object)) {
                return true;
            }
        }
        return false;
    };
}
if (!Array.prototype.reduce) {
    Array.prototype.reduce = function reduce(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }
        if (!length && arguments.length == 1) {
            throw new TypeError("reduce of empty array with no initial value");
        }

        var i = 0;
        var result;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i++];
                    break;
                }
                if (++i >= length) {
                    throw new TypeError("reduce of empty array with no initial value");
                }
            } while (true);
        }

        for (; i < length; i++) {
            if (i in self) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        }

        return result;
    };
}
if (!Array.prototype.reduceRight) {
    Array.prototype.reduceRight = function reduceRight(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }
        if (!length && arguments.length == 1) {
            throw new TypeError("reduceRight of empty array with no initial value");
        }

        var result, i = length - 1;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i--];
                    break;
                }
                if (--i < 0) {
                    throw new TypeError("reduceRight of empty array with no initial value");
                }
            } while (true);
        }

        do {
            if (i in this) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        } while (i--);

        return result;
    };
}
if (!Array.prototype.indexOf || ([0, 1].indexOf(1, 2) != -1)) {
    Array.prototype.indexOf = function indexOf(sought /*, fromIndex */ ) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }

        var i = 0;
        if (arguments.length > 1) {
            i = toInteger(arguments[1]);
        }
        i = i >= 0 ? i : Math.max(0, length + i);
        for (; i < length; i++) {
            if (i in self && self[i] === sought) {
                return i;
            }
        }
        return -1;
    };
}
if (!Array.prototype.lastIndexOf || ([0, 1].lastIndexOf(0, -3) != -1)) {
    Array.prototype.lastIndexOf = function lastIndexOf(sought /*, fromIndex */) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }
        var i = length - 1;
        if (arguments.length > 1) {
            i = Math.min(i, toInteger(arguments[1]));
        }
        i = i >= 0 ? i : length - Math.abs(i);
        for (; i >= 0; i--) {
            if (i in self && sought === self[i]) {
                return i;
            }
        }
        return -1;
    };
}
if (!Object.getPrototypeOf) {
    Object.getPrototypeOf = function getPrototypeOf(object) {
        return object.__proto__ || (
            object.constructor ?
            object.constructor.prototype :
            prototypeOfObject
        );
    };
}
if (!Object.getOwnPropertyDescriptor) {
    var ERR_NON_OBJECT = "Object.getOwnPropertyDescriptor called on a " +
                         "non-object: ";
    Object.getOwnPropertyDescriptor = function getOwnPropertyDescriptor(object, property) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT + object);
        if (!owns(object, property))
            return;

        var descriptor, getter, setter;
        descriptor =  { enumerable: true, configurable: true };
        if (supportsAccessors) {
            var prototype = object.__proto__;
            object.__proto__ = prototypeOfObject;

            var getter = lookupGetter(object, property);
            var setter = lookupSetter(object, property);
            object.__proto__ = prototype;

            if (getter || setter) {
                if (getter) descriptor.get = getter;
                if (setter) descriptor.set = setter;
                return descriptor;
            }
        }
        descriptor.value = object[property];
        return descriptor;
    };
}
if (!Object.getOwnPropertyNames) {
    Object.getOwnPropertyNames = function getOwnPropertyNames(object) {
        return Object.keys(object);
    };
}
if (!Object.create) {
    var createEmpty;
    if (Object.prototype.__proto__ === null) {
        createEmpty = function () {
            return { "__proto__": null };
        };
    } else {
        createEmpty = function () {
            var empty = {};
            for (var i in empty)
                empty[i] = null;
            empty.constructor =
            empty.hasOwnProperty =
            empty.propertyIsEnumerable =
            empty.isPrototypeOf =
            empty.toLocaleString =
            empty.toString =
            empty.valueOf =
            empty.__proto__ = null;
            return empty;
        }
    }

    Object.create = function create(prototype, properties) {
        var object;
        if (prototype === null) {
            object = createEmpty();
        } else {
            if (typeof prototype != "object")
                throw new TypeError("typeof prototype["+(typeof prototype)+"] != 'object'");
            var Type = function () {};
            Type.prototype = prototype;
            object = new Type();
            object.__proto__ = prototype;
        }
        if (properties !== void 0)
            Object.defineProperties(object, properties);
        return object;
    };
}

function doesDefinePropertyWork(object) {
    try {
        Object.defineProperty(object, "sentinel", {});
        return "sentinel" in object;
    } catch (exception) {
    }
}
if (Object.defineProperty) {
    var definePropertyWorksOnObject = doesDefinePropertyWork({});
    var definePropertyWorksOnDom = typeof document == "undefined" ||
        doesDefinePropertyWork(document.createElement("div"));
    if (!definePropertyWorksOnObject || !definePropertyWorksOnDom) {
        var definePropertyFallback = Object.defineProperty;
    }
}

if (!Object.defineProperty || definePropertyFallback) {
    var ERR_NON_OBJECT_DESCRIPTOR = "Property description must be an object: ";
    var ERR_NON_OBJECT_TARGET = "Object.defineProperty called on non-object: "
    var ERR_ACCESSORS_NOT_SUPPORTED = "getters & setters can not be defined " +
                                      "on this javascript engine";

    Object.defineProperty = function defineProperty(object, property, descriptor) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT_TARGET + object);
        if ((typeof descriptor != "object" && typeof descriptor != "function") || descriptor === null)
            throw new TypeError(ERR_NON_OBJECT_DESCRIPTOR + descriptor);
        if (definePropertyFallback) {
            try {
                return definePropertyFallback.call(Object, object, property, descriptor);
            } catch (exception) {
            }
        }
        if (owns(descriptor, "value")) {

            if (supportsAccessors && (lookupGetter(object, property) ||
                                      lookupSetter(object, property)))
            {
                var prototype = object.__proto__;
                object.__proto__ = prototypeOfObject;
                delete object[property];
                object[property] = descriptor.value;
                object.__proto__ = prototype;
            } else {
                object[property] = descriptor.value;
            }
        } else {
            if (!supportsAccessors)
                throw new TypeError(ERR_ACCESSORS_NOT_SUPPORTED);
            if (owns(descriptor, "get"))
                defineGetter(object, property, descriptor.get);
            if (owns(descriptor, "set"))
                defineSetter(object, property, descriptor.set);
        }

        return object;
    };
}
if (!Object.defineProperties) {
    Object.defineProperties = function defineProperties(object, properties) {
        for (var property in properties) {
            if (owns(properties, property))
                Object.defineProperty(object, property, properties[property]);
        }
        return object;
    };
}
if (!Object.seal) {
    Object.seal = function seal(object) {
        return object;
    };
}
if (!Object.freeze) {
    Object.freeze = function freeze(object) {
        return object;
    };
}
try {
    Object.freeze(function () {});
} catch (exception) {
    Object.freeze = (function freeze(freezeObject) {
        return function freeze(object) {
            if (typeof object == "function") {
                return object;
            } else {
                return freezeObject(object);
            }
        };
    })(Object.freeze);
}
if (!Object.preventExtensions) {
    Object.preventExtensions = function preventExtensions(object) {
        return object;
    };
}
if (!Object.isSealed) {
    Object.isSealed = function isSealed(object) {
        return false;
    };
}
if (!Object.isFrozen) {
    Object.isFrozen = function isFrozen(object) {
        return false;
    };
}
if (!Object.isExtensible) {
    Object.isExtensible = function isExtensible(object) {
        if (Object(object) === object) {
            throw new TypeError(); // TODO message
        }
        var name = '';
        while (owns(object, name)) {
            name += '?';
        }
        object[name] = true;
        var returnValue = owns(object, name);
        delete object[name];
        return returnValue;
    };
}
if (!Object.keys) {
    var hasDontEnumBug = true,
        dontEnums = [
            "toString",
            "toLocaleString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "constructor"
        ],
        dontEnumsLength = dontEnums.length;

    for (var key in {"toString": null}) {
        hasDontEnumBug = false;
    }

    Object.keys = function keys(object) {

        if (
            (typeof object != "object" && typeof object != "function") ||
            object === null
        ) {
            throw new TypeError("Object.keys called on a non-object");
        }

        var keys = [];
        for (var name in object) {
            if (owns(object, name)) {
                keys.push(name);
            }
        }

        if (hasDontEnumBug) {
            for (var i = 0, ii = dontEnumsLength; i < ii; i++) {
                var dontEnum = dontEnums[i];
                if (owns(object, dontEnum)) {
                    keys.push(dontEnum);
                }
            }
        }
        return keys;
    };

}
if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}
var ws = "\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003" +
    "\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028" +
    "\u2029\uFEFF";
if (!String.prototype.trim || ws.trim()) {
    ws = "[" + ws + "]";
    var trimBeginRegexp = new RegExp("^" + ws + ws + "*"),
        trimEndRegexp = new RegExp(ws + ws + "*$");
    String.prototype.trim = function trim() {
        return String(this).replace(trimBeginRegexp, "").replace(trimEndRegexp, "");
    };
}

function toInteger(n) {
    n = +n;
    if (n !== n) { // isNaN
        n = 0;
    } else if (n !== 0 && n !== (1/0) && n !== -(1/0)) {
        n = (n > 0 || -1) * Math.floor(Math.abs(n));
    }
    return n;
}

function isPrimitive(input) {
    var type = typeof input;
    return (
        input === null ||
        type === "undefined" ||
        type === "boolean" ||
        type === "number" ||
        type === "string"
    );
}

function toPrimitive(input) {
    var val, valueOf, toString;
    if (isPrimitive(input)) {
        return input;
    }
    valueOf = input.valueOf;
    if (typeof valueOf === "function") {
        val = valueOf.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    toString = input.toString;
    if (typeof toString === "function") {
        val = toString.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    throw new TypeError();
}
var toObject = function (o) {
    if (o == null) { // this matches both null and undefined
        throw new TypeError("can't convert "+o+" to object");
    }
    return Object(o);
};

});
