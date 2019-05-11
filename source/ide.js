"use strict";

///////////////////////////////////////////////////////////
// IDE for TScript development
//

let ide = (function() {
if (window.location.search != "") return null;

let module = {};

function guid()
{
	return (((1 + Math.random()) * 0x10000000000) | 0).toString(16).substring(1)
			+ "-"
			+ (((new Date()).getTime() * 1000 | 0) % 0x1000000 + 0x1000000).toString(16).substring(1);
}

function makeMarker()
{
	let marker = document.createElement("span");
	marker.style.color = "#a00";
	marker.innerHTML = "\u25CF";
	return marker;
};

function relpos(element, x, y)
{
	while (element)
	{
		x -= element.offsetLeft;
		y -= element.offsetTop;
		element = element.offsetParent;
	}
	return {"x": x, "y": y};
}

// manage documentation window
module.documentationWindow = null;
function showdoc(path = "")
{
	if (module.documentationWindow)
	{
		module.documentationWindow.close();
		module.documentationWindow = null;
	}
	let fn = location.pathname.substring(location.pathname.lastIndexOf("/") + 1);
	module.documentationWindow = window.open(fn + "?doc" + path, 'TScript documentation');
}


// document properties
module.document = {
			filename: "",     // name in local storage, or empty string
			dirty: false,     // does the state differ from the last saved state?
		},


// current interpreter, non-null after successful parsing
module.interpreter = null;


// set the cursor in the editor; line is 1-based, ch (char within the line) is 0-based
let setCursorPosition = function(line, ch)
{
	if (ch === undefined) ch = 0;
	module.sourcecode.setCursor(line-1, ch);
	module.sourcecode.focus();
//	module.sourcecode.scrollIntoView({"line": line-1, "ch": 0}, 40);
	let s = module.sourcecode.getScrollInfo();
	let y = module.sourcecode.charCoords({"line": line-1, "ch": 0}, "local").top;
	let h = module.sourcecode.getScrollerElement().offsetHeight;
	if (y < s.top + 0.1 * s.clientHeight || y >= s.top + 0.9 * s.clientHeight)
	{
		y = y - 0.5 * h - 5;
		module.sourcecode.scrollTo(null, y);
	}
};

let text2html = function(s)
{
	return s.replace(/&/g, "&amp;")
	        .replace(/</g, "&lt;")
	        .replace(/>/g, "&gt;")
	        .replace(/"/g, "&quot;")
	        .replace(/'/g, "&#039;");
}

const type2css = ["ide-keyword", "ide-keyword", "ide-integer", "ide-real", "ide-string", "ide-collection", "ide-collection", "ide-builtin", "ide-builtin", "ide-builtin", "ide-builtin"];

// This function defines the stack trace tree.
function stackinfo(value, node_id)
{
	let ret = { "children": [], "ids": [] };
	if (! module.interpreter) return ret;

	if (value === null)
	{
		for (var i=module.interpreter.stack.length-1; i>=0; i--)
		{
			ret.children.push({
					"nodetype": "frame",
					"index": i,
					"frame": module.interpreter.stack[i],
				});
			ret.ids.push("/" + i);
		}
	}
	else
	{
		if (! value.hasOwnProperty("nodetype")) throw "[stacktree.update] missing value.nodetype";
		if (value.nodetype == "frame")
		{
			ret.opened = true;
			let func = value.frame.pe[0];
			ret.element = document.createElement("span");
			tgui.createElement({
					"type": "span",
					"parent": ret.element,
					"text": "[" + value.index + "] ",
					"classname": "ide-index",
				});
			tgui.createText(func.petype + " " + TScript.displayname(func), ret.element);
			if (value.frame.object)
			{
				ret.children.push({
						"nodetype": "typedvalue",
						"index": "this",
						"typedvalue": value.frame.object,
					});
				ret.ids.push(node_id + "/this");
			}
			for (let i=0; i<value.frame.variables.length; i++)
			{
				ret.children.push({
						"nodetype": "typedvalue",
						"index": TScript.displayname(func.variables[i]),
						"typedvalue": value.frame.variables[i],
					});
				ret.ids.push(node_id + "/" + func.variables[i].name);
			}
			if (value.frame.temporaries.length > 0)
			{
				ret.children.push({
						"nodetype": "temporaries",
						"index": "temporaries",
						"frame": value.frame,
					});
				ret.ids.push(node_id + "/<temporaries>");
			}
		}
		else if (value.nodetype == "typedvalue")
		{
			ret.opened = false;
			ret.element = document.createElement("span");
			let s = ret.opened ? value.typedvalue.type.name : TScript.previewValue(value.typedvalue);
			if (value.typedvalue.type.id == TScript.typeid_array)
			{
				for (let i=0; i<value.typedvalue.value.b.length; i++)
				{
					ret.children.push({
							"nodetype": "typedvalue",
							"index": i,
							"typedvalue": value.typedvalue.value.b[i],
						});
					ret.ids.push(node_id + "/" + i);
				}
				s = "Array(" + ret.children.length + ") " + s;
			}
			else if (value.typedvalue.type.id == TScript.typeid_dictionary)
			{
				for (let key in value.typedvalue.value.b)
				{
					if (value.typedvalue.value.b.hasOwnProperty(key))
					{
						ret.children.push({
								"nodetype": "typedvalue",
								"index": key,
								"typedvalue": value.typedvalue.value.b[key],
							});
						ret.ids.push(node_id + "/" + key);
					}
				}
				s = "Dictionary(" + ret.children.length + ") " + s;
			}
			else if (value.typedvalue.type.id == TScript.typeid_function)
			{
				if (value.typedvalue.value.b.hasOwnProperty("object"))
				{
					ret.children.push({
							"nodetype": "typedvalue",
							"index": "this",
							"typedvalue": value.typedvalue.value.b.object,
						});
					ret.ids.push(node_id + "/this");
				}
				if (value.typedvalue.value.b.hasOwnProperty("enclosed"))
				{
					for (let i=0; i<value.typedvalue.value.b.enclosed.length; i++)
					{
						ret.children.push({
								"nodetype": "typedvalue",
								"index": value.typedvalue.value.b.func.closureparams[i].name,
								"typedvalue": value.typedvalue.value.b.enclosed[i],
							});
						ret.ids.push(node_id + "/" + value.typedvalue.value.b.func.closureparams[i].name);
					}
				}
			}
			else if (value.typedvalue.type.id >= TScript.typeid_class)
			{
				let type = value.typedvalue.type;
				let types = [];
				while (type)
				{
					types.unshift(type);
					type = type.superclass;
				}
				for (let j=0; j<types.length; j++)
				{
					type = types[j];
					if (! type.variables) continue;
					for (let i=0; i<type.variables.length; i++)
					{
						ret.children.push({
								"nodetype": "typedvalue",
								"index": type.variables[i].name,
								"typedvalue": value.typedvalue.value.a[type.variables[i].id],
							});
						ret.ids.push(node_id + "/" + type.variables[i].name);
					}
				}
			}
			tgui.createElement({"type": "span", "parent": ret.element, "text": value.index + ": ", "classname": "ide-index"});
			tgui.createElement({
					"type": "span",
					"parent": ret.element,
					"classname": (value.typedvalue.type.id < type2css.length) ? type2css[value.typedvalue.type.id] : "ide-userclass",
					"text": s,
				});
		}
		else if (value.nodetype == "temporaries")
		{
			ret.opened = true;
			ret.element = tgui.createElement({"type": "span", "parent": ret.element, "text": "[temporaries]"});
			let j = 0;
			for (let i=0; i<value.frame.temporaries.length; i++)
			{
				if (value.frame.temporaries[i].hasOwnProperty("type") && value.frame.temporaries[i].hasOwnProperty("value"))
				{
					ret.children.push({
							"nodetype": "typedvalue",
							"index": i,
							"typedvalue": value.frame.temporaries[i],
						});
					ret.ids.push(node_id + "/" + j);
					j++;
				}
			}
		}
		else throw "[stacktree.update] unknown nodetype: " + value.nodetype;
	}
	return ret;
}

// This function defines the program tree.
function programinfo(value, node_id)
{
	let ret = { "children": [], "ids": [] };
	if (! module.interpreter) return ret;
	if (module.interpreter.stack.length == 0) return ret;

	let frame = module.interpreter.stack[module.interpreter.stack.length - 1];
	let current_pe = frame.pe[frame.pe.length - 1];
	let current_pes = new Set();
	for (let i=0; i<frame.pe.length; i++) current_pes.add(frame.pe[i]);

	if (value === null)
	{
		ret.children.push(module.interpreter.program);
		ret.ids.push("");
	}
	else
	{
		ret.opened = true;

		let pe = value;
		if (pe.petype == "expression") pe = pe.sub;
		else if (pe.petype == "group") pe = pe.sub;

		ret.element = document.createElement("div");
		let s = "";
		let css = "";
		s += pe.petype;
		if (pe.name) s += " " + pe.name;

		let petype = String(pe.petype);
		if (petype == "global scope" || petype == "scope" || petype == "namespace")
		{
			for (let i=0; i<pe.commands.length; i++)
			{
				if (pe.commands[i].hasOwnProperty("builtin") && pe.commands[i].builtin) continue;
				if (pe.commands[i].petype == "breakpoint") continue;
				ret.children.push(pe.commands[i]);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "conditional statement")
		{
			ret.children.push(pe.condition);
			ret.ids.push(node_id + "/" + ret.children.length);
			ret.children.push(pe.then_part);
			ret.ids.push(node_id + "/" + ret.children.length);
			if (pe.else_part)
			{
				ret.children.push(pe.else_part);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "for-loop")
		{
			ret.children.push(pe.iterable);
			ret.ids.push(node_id + "/" + ret.children.length);
			ret.children.push(pe.body);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype == "do-while-loop" || petype == "while-do-loop")
		{
			ret.children.push(pe.condition);
			ret.ids.push(node_id + "/" + ret.children.length);
			ret.children.push(pe.body);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype == "break")
		{ }
		else if (petype == "continue")
		{ }
		else if (petype == "return")
		{
			if (pe.argument)
			{
				ret.children.push(pe.argument);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "variable declaration")
		{
			for (let i=0; i<pe.vars.length; i++)
			{
				ret.children.push(pe.vars[i]);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "variable" || petype == "attribute")
		{
			if (pe.initializer)
			{
				ret.children.push(pe.initializer);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "function" || petype == "method")
		{
			for (let i=0; i<pe.params.length; i++)
			{
				let n = pe.names[pe.params[i].name];
				if (n)
				{
					ret.children.push(n);
					ret.ids.push(node_id + "/" + ret.children.length);
				}
			}
			for (let i=0; i<pe.commands.length; i++)
			{
				if (pe.commands[i].petype == "breakpoint") continue;
				ret.children.push(pe.commands[i]);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "type")
		{
			ret.children.push(pe.class_constructor);
			ret.ids.push(node_id + "/" + ret.children.length);
			for (let key in pe.members)
			{
				if (pe.members.hasOwnProperty(key))
				{
					ret.children.push(pe.members[key]);
					ret.ids.push(node_id + "/" + ret.children.length);
				}
			}
			for (let key in pe.staticmembers)
			{
				if (pe.staticmembers.hasOwnProperty(key))
				{
					ret.children.push(pe.staticmembers[key]);
					ret.ids.push(node_id + "/" + ret.children.length);
				}
			}
		}
		else if (petype == "constant")
		{
			s = TScript.previewValue(pe.typedvalue);
			css = (pe.typedvalue.type.id < type2css.length) ? type2css[pe.typedvalue.type.id] : "ide-userclass";
		}
		else if (petype == "name")
		{
			// nothing to do...?
		}
		else if (petype == "this")
		{ }
		else if (petype == "closure")
		{
			ret.children.push(pe.func);
			ret.ids.push(node_id + "/" + ret.children.length);
			for (let i=0; i<pe.func.closureparams.length; i++)
			{
				ret.children.push(pe.func.closureparams[i].initializer);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "array")
		{
			for (let i=0; i<pe.elements.length; i++)
			{
				ret.children.push(pe.elements[i]);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "dictionary")
		{
			for (let i=0; i<pe.values.length; i++)
			{
				ret.children.push(pe.values[i]);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "function call")
		{
			ret.children.push(pe.base);
			ret.ids.push(node_id + "/" + ret.children.length);
			for (let i=0; i<pe.arguments.length; i++)
			{
				ret.children.push(pe.arguments[i]);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "named argument")
		{
			s = pe.name;
			if (pe.argument)
			{
				ret.children.push(pe.argument);
				ret.ids.push(node_id + "/" + ret.children.length);
			}
		}
		else if (petype == "item access")
		{
			ret.children.push(pe.base);
			ret.ids.push(node_id + "/" + ret.children.length);
			ret.children.push(pe.argument);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype.substr(0, 17) == "access of member ")
		{
			ret.children.push(pe.object);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype.substr(0, 11) == "assignment ")
		{
			ret.children.push(pe.lhs);
			ret.ids.push(node_id + "/" + ret.children.length);
			ret.children.push(pe.rhs);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype.substr(0, 20) == "left-unary operator ")
		{
			ret.children.push(pe.argument);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype.substr(0, 16) == "binary operator ")
		{
			ret.children.push(pe.lhs);
			ret.ids.push(node_id + "/" + ret.children.length);
			ret.children.push(pe.rhs);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype == "try-catch")
		{
			ret.children.push(pe.try_part);
			ret.ids.push(node_id + "/" + ret.children.length);
			ret.children.push(pe.catch_part);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype == "try")
		{
			ret.children.push(pe.command);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype == "catch")
		{
			ret.children.push(pe.command);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype == "throw")
		{
			ret.children.push(pe.argument);
			ret.ids.push(node_id + "/" + ret.children.length);
		}
		else if (petype == "use")
		{ }
		else if (petype == "no-operation")
		{ }
		else if (petype == "breakpoint")
		{
			throw "[programinfo] internal error; breakpoints should not be listed";
		}
		else
		{
			throw "[programinfo] petype '" + petype + "' not covered";
		}

		if (current_pes.has(pe))
		{
			if (pe == current_pe)
			{
				css += " ide-program-current";
				ret.visible = true;
			}
			else css += " ide-program-ancestor";
		}

		tgui.createElement({
				"type": "span",
				"parent": ret.element,
				"classname": css,
				"text": s,
			});
		if (pe.where) tgui.createElement({"type": "span", "parent": ret.element, "text": " (" + pe.where.line + ":" + pe.where.ch + ")", "classname": "ide-index"});
	}

	return ret;
}

// visually indicate the interpreter state
function updateStatus()
{
	// update status indicator
	if (module.interpreter)
	{
		if (module.interpreter.status == "running")
		{
			if (module.interpreter.background) module.programstate.running();
			else module.programstate.stepping();
		}
		else if (module.interpreter.status == "waiting") module.programstate.waiting();
		else if (module.interpreter.status == "error") module.programstate.error();
		else if (module.interpreter.status == "finished") module.programstate.finished();
		else throw "internal error; unknown interpreter state";
	}
	else
	{
		if (module.messages.innerHTML != "") module.programstate.error();
		else module.programstate.unchecked();
	}

	// update read-only state of the editor
	if (module.sourcecode)
	{
		let should = module.interpreter && (module.interpreter.status == "running" || module.interpreter.status == "waiting");
		if (module.sourcecode.getOption("readOnly") != should)
		{
			module.sourcecode.setOption("readOnly", should);
			let ed = document.getElementsByClassName("CodeMirror");
			let value = should ? 0.6 : 1;
			for (let i=0; i<ed.length; i++) ed[i].style.opacity = value;
		}
	}
}

// update the controls to reflect the interpreter state
function updateControls()
{
	// move the cursor in the source code
	if (module.interpreter)
	{
		if (module.interpreter.stack.length > 0)
		{
			var frame = module.interpreter.stack[module.interpreter.stack.length - 1];
			var pe = frame.pe[frame.pe.length - 1];
			if (pe.where) setCursorPosition(pe.where.line, pe.where.ch);
		}
		else
		{
			setCursorPosition(module.sourcecode.lineCount(), 1000000);
		}
	}

	// show the current stack state
	module.stacktree.update(stackinfo);

	// show the current program tree
	module.programtree.update(programinfo);

	updateStatus();
}

// add a message to the message panel
module.addMessage = function(type, text, line, ch, href)
{
	let color = {"print": "#00f", "warning": "#f80", "error": "#f00"};
	let tr = tgui.createElement({"type": "tr", "parent": module.messages, "classname": "ide", "style": {"vertical-align": "top"}});
	let th = tgui.createElement({"type": "th", "parent": tr, "classname": "ide", "style": {"width": "20px"}});
	let bullet = tgui.createElement({"type": "span", "parent": th, "style": {"width": "20px", "color": color[type]}, "html": (href ? "&#128712;" : "\u2022")});
	if (href)
	{
		bullet.style.cursor = "pointer";
		bullet.addEventListener("click", function(event)
				{
					showdoc(href);
					return false;
				});
	}
	let td = tgui.createElement({"type": "td", "parent": tr, "classname": "ide"});
	let lines = text.split('\n');
	for (let i=0; i<lines.length; i++)
	{
		let msg = tgui.createElement({"type": "div", "parent": td, "classname": "ide ide-message" + (type != "print" ? " ide-errormessage" : ""), "text": lines[i]});
		if (line !== undefined)
		{
			msg.ide_line = line;
			msg.ide_ch = ch;
			msg.addEventListener("click", function(event)
					{
						setCursorPosition(event.target.ide_line, event.target.ide_ch);
						if (module.interpreter && (module.interpreter.status != "running" || !module.interpreter.background))
						{
							updateControls();
						}
						return false;
					});
		}
	}
	module.messagecontainer.scrollTop = module.messagecontainer.scrollHeight;
	if (href) module.sourcecode.focus();
}

// Stop the interpreter and clear all output,
// put the IDE into "not yet checked" mode.
function clear()
{
	if (module.interpreter) module.interpreter.stopthread();
	module.interpreter = null;

	tgui.clearElement(module.messages);
	{
		let ctx = module.turtle.getContext("2d");
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, module.turtle.width, module.turtle.height);
	}
	module.turtle.turtle_position = [0, 0];
	module.turtle.turtle_angle = 0;
	module.turtle.turtle_color = "rgb(0,0,0)";
	module.turtle.turtle_pen = true;
	{
		let ctx = module.canvas.getContext("2d");
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, module.canvas.width, module.canvas.height);
		ctx.lineWidth = 1;
		ctx.fillStyle = "#000";
		ctx.strokeStyle = "#000";
		ctx.font = "16px Helvetica";
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
	}
}

// Prepare everything for the program to start running,
// put the IDE into stepping mode at the start of the program.
function prepare_run()
{
	clear();

	// make sure that there is a trailing line for the "end" breakpoint
	let source = module.sourcecode.getValue();
	if (source.length != 0 && source[source.length - 1] != '\n')
	{
		source += '\n';
		module.sourcecode.getDoc().replaceRange('\n', CodeMirror.Pos(module.sourcecode.lastLine()));
	}

	let result = TScript.parse(source);
	let program = result.program;
	let html = "";
	let errors = result.errors;
	if (errors)
	{
		for (let i=0; i<errors.length; i++)
		{
			let err = errors[i];
			module.addMessage(err.type, err.type + " in line " + err.line + ": " + err.message, err.line, err.ch, err.href);
		}
	}

	if (program)
	{
// console.log(program);
		module.interpreter = new TScript.Interpreter(program);
		module.interpreter.service.documentation_mode = false;
		module.interpreter.service.print = (function(msg) { module.addMessage("print", msg); });
		module.interpreter.service.alert = (function(msg) { alert(msg); });
		module.interpreter.service.confirm = (function(msg) { return confirm(msg); });
		module.interpreter.service.prompt = (function(msg) { return prompt(msg); });
		module.interpreter.service.message = (function(msg, line, ch, href)
				{
					if (line === undefined) line = null;
					if (ch === undefined) ch = null;
					if (href === undefined) href = "";
					module.addMessage("error", msg, line, ch, href);
				});
		module.interpreter.service.statechanged = function()
				{
					updateStatus();
					if (module.interpreter.status == "finished") module.sourcecode.focus();
				};
		module.interpreter.service.breakpoint = function()
				{
					updateControls();
				};
		module.interpreter.service.turtle = module.turtle;
		module.interpreter.service.canvas = module.canvas;
		module.interpreter.eventnames["canvas.resize"] = true;
		module.interpreter.eventnames["canvas.mousedown"] = true;
		module.interpreter.eventnames["canvas.mouseup"] = true;
		module.interpreter.eventnames["canvas.mousemove"] = true;
		module.interpreter.eventnames["canvas.mouseout"] = true;
		module.interpreter.eventnames["canvas.keydown"] = true;
		module.interpreter.eventnames["canvas.keyup"] = true;
		module.interpreter.eventnames["timer"] = true;
		module.interpreter.reset();

		// set and correct breakpoints
		let br = [];
		for (let i=1; i<=module.sourcecode.lineCount(); i++)
		{
			if (module.sourcecode.lineInfo(i-1).gutterMarkers) br.push(i);
		}
		let result = module.interpreter.defineBreakpoints(br);
		if (result !== null)
		{
			for (let i=1; i<=module.sourcecode.lineCount(); i++)
			{
				if (module.sourcecode.lineInfo(i-1).gutterMarkers)
				{
					if (! result.hasOwnProperty(i)) module.sourcecode.setGutterMarker(i-1, "breakpoints", null);
				}
				else
				{
					if (result.hasOwnProperty(i)) module.sourcecode.setGutterMarker(i-1, "breakpoints", makeMarker());
				}
			}
			alert("Note: breakpoints were moved to valid locations");
		}
	}

	updateControls();
};

let cmd_reset = function()
{
	clear();
	updateControls();
}

let cmd_run = function()
{
	if (! module.interpreter || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) prepare_run();
	if (! module.interpreter) return;
	module.interpreter.run();
	updateControls();
	module.canvas.parentElement.focus();
};

let cmd_interrupt = function()
{
	if (! module.interpreter || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) return;
	module.interpreter.interrupt();
	updateControls();
};

let cmd_step_into = function()
{
	if (! module.interpreter || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) prepare_run();
	if (! module.interpreter) return;
	if (module.interpreter.running) return;
	module.interpreter.step_into();
	updateControls();
};

let cmd_step_over = function()
{
	if (! module.interpreter || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) prepare_run();
	if (! module.interpreter) return;
	if (module.interpreter.running) return;
	module.interpreter.step_over();
	updateControls();
};

let cmd_step_out = function()
{
	if (! module.interpreter || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) prepare_run();
	if (! module.interpreter) return;
	if (module.interpreter.running) return;
	module.interpreter.step_out();
	updateControls();
};

let cmd_toggle_breakpoint = function()
{
	let cm = module.sourcecode;
	let line = cm.doc.getCursor().line;
	if (module.interpreter)
	{
		// ask the interpreter for the correct position of the marker
		let result = module.interpreter.toggleBreakpoint(line+1);
		if (result !== null)
		{
			line = result.line;
			cm.setGutterMarker(line-1, "breakpoints", result.active ? makeMarker() : null);
			module.sourcecode.scrollIntoView({"line": line-1}, 40);
		}
	}
	else
	{
		// set the marker optimistically, fix as soon as an interpreter is created
		cm.setGutterMarker(line, "breakpoints", cm.lineInfo(line).gutterMarkers ? null : makeMarker());
	}
}

let cmd_new = function()
{
	if (module.document.dirty)
	{
		if (! confirm("The document may have unsaved changes.\nDo you want to discard the code?")) return;
	}

	clear();

	module.editor_title.innerHTML = "editor";
	module.document.filename = "";
	module.sourcecode.setValue("");
	module.sourcecode.getDoc().clearHistory();
	module.document.dirty = false;

	updateControls();
	module.sourcecode.focus();
}

let cmd_load = function()
{
	if (module.document.dirty)
	{
		if (! confirm("The document has unsaved changes.\nDo you want to discard the code?")) return;
	}

	let dlg = fileDlg("load file", module.document.filename, false, function(filename)
			{
				clear();

				module.editor_title.innerHTML = "editor &mdash; " + filename;
				module.document.filename = filename;
				module.sourcecode.setValue(localStorage.getItem("tscript_code_" + filename));
				module.sourcecode.getDoc().setCursor({line: 0, ch: 0}, );
				module.sourcecode.getDoc().clearHistory();
				module.document.dirty = false;

				updateControls();
				module.sourcecode.focus();
			});
}

let cmd_save = function()
{
	if (module.document.filename == "")
	{
		cmd_save_as();
		return;
	}

	localStorage.setItem("tscript_code_" + module.document.filename, module.sourcecode.getValue());
	module.document.dirty = false;
}

let cmd_save_as = function()
{
	let dlg = fileDlg("save file as ...", module.document.filename, true, function(filename)
			{
				module.editor_title.innerHTML = "editor &mdash; " + filename;
				module.document.filename = filename;
				cmd_save();
				module.sourcecode.focus();
			});
}

let buttons = [
		{
			"click": cmd_new,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.strokeStyle = "#741";
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.moveTo( 8.5, 3);
						ctx.lineTo(11.5, 10);
						ctx.stroke();
						ctx.beginPath();
						ctx.moveTo(11.5, 3);
						ctx.lineTo( 8.5, 10);
						ctx.stroke();
						ctx.beginPath();
						ctx.moveTo( 6.8, 6.5);
						ctx.lineTo(13.2, 6.5);
						ctx.stroke();
						ctx.fillStyle = "#000";
						ctx.fillRect(3, 13, 14, 4);
						ctx.fillStyle = "#ccc";
						ctx.fillRect(12, 14, 4, 2);
					},
			"tooltip": "new document",
			"hotkey": "shift-control-n",
		},
		{
			"click": cmd_load,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#741";
						ctx.strokeStyle = "#741";
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.moveTo(10, 12);
						ctx.lineTo(10, 7);
						ctx.stroke();
						ctx.beginPath();
						ctx.moveTo(6, 7);
						ctx.lineTo(14, 7);
						ctx.lineTo(10, 3);
						ctx.fill();
						ctx.fillStyle = "#000";
						ctx.fillRect(3, 13, 14, 4);
						ctx.fillStyle = "#ccc";
						ctx.fillRect(12, 14, 4, 2);
					},
			"tooltip": "open document",
			"hotkey": "control-o",
		},
		{
			"click": cmd_save,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#741";
						ctx.strokeStyle = "#741";
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.moveTo(10, 3);
						ctx.lineTo(10, 8);
						ctx.stroke();
						ctx.beginPath();
						ctx.moveTo(6, 8);
						ctx.lineTo(14, 8);
						ctx.lineTo(10, 12);
						ctx.fill();
						ctx.fillStyle = "#000";
						ctx.fillRect(3, 13, 14, 4);
						ctx.fillStyle = "#ccc";
						ctx.fillRect(12, 14, 4, 2);
					},
			"tooltip": "save document",
			"hotkey": "control-s",
		},
		{
			"click": cmd_save_as,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#741";
						ctx.strokeStyle = "#741";
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.moveTo(6, 3);
						ctx.lineTo(10, 3);
						ctx.lineTo(10, 8);
						ctx.stroke();
						ctx.beginPath();
						ctx.moveTo(6, 8);
						ctx.lineTo(14, 8);
						ctx.lineTo(10, 12);
						ctx.fill();
						ctx.fillStyle = "#000";
						ctx.fillRect(3, 13, 14, 4);
						ctx.fillStyle = "#ccc";
						ctx.fillRect(12, 14, 4, 2);
					},
			"tooltip": "save document as ...",
			"hotkey": "shift-control-s",
		},
		{
			"click": cmd_run,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#080";
						ctx.beginPath();
						ctx.moveTo(5, 5);
						ctx.lineTo(15, 10);
						ctx.lineTo(5, 15);
						ctx.fill();
					},
			"tooltip": "run the program, or continue running the program",
			"hotkey": "F7",
		},
		{
			"click": cmd_interrupt,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#c00";
						ctx.fillRect(5, 5, 4, 10);
						ctx.fillRect(11, 5, 4, 10);
					},
			"tooltip": "interrupt the program",
			"hotkey": "shift-F7",
		},
		{
			"click": cmd_reset,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#c00";
						ctx.fillRect(5, 5, 10, 10);
					},
			"tooltip": "abort the program",
			"hotkey": "F10",
		},
		{
			"click": cmd_step_into,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#000";
						ctx.fillRect(10,  3, 7, 2);
						ctx.fillRect(13,  6, 4, 2);
						ctx.fillRect(13,  9, 4, 2);
						ctx.fillRect(13, 12, 4, 2);
						ctx.fillRect(10, 15, 7, 2);
						ctx.lineWidth = 1;
						ctx.strokeStyle = "#00f";
						ctx.beginPath();
						ctx.moveTo(8, 4);
						ctx.lineTo(3, 4);
						ctx.lineTo(3, 10);
						ctx.lineTo(6, 10);
						ctx.stroke();
						ctx.fillStyle = "#00f";
						ctx.beginPath();
						ctx.moveTo(5, 7);
						ctx.lineTo(5, 13);
						ctx.lineTo(9.5, 10);
						ctx.fill();
					},
			"tooltip": "run the current command, step into function calls",
			"hotkey": "F11",
		},
		{
			"click": cmd_step_over,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#000";
						ctx.fillRect(10,  3, 7, 2);
						ctx.fillRect(13,  6, 4, 2);
						ctx.fillRect(13,  9, 4, 2);
						ctx.fillRect(13, 12, 4, 2);
						ctx.fillRect(10, 15, 7, 2);
						ctx.lineWidth = 1;
						ctx.strokeStyle = "#00f";
						ctx.beginPath();
						ctx.moveTo(8, 4);
						ctx.lineTo(3, 4);
						ctx.lineTo(3, 16);
						ctx.lineTo(6, 16);
						ctx.stroke();
						ctx.fillStyle = "#00f";
						ctx.beginPath();
						ctx.moveTo(5, 13);
						ctx.lineTo(5, 19);
						ctx.lineTo(9.5, 16);
						ctx.fill();
					},
			"tooltip": "run the current line of code, do no step into function calls",
			"hotkey": "control-F11",
		},
		{
			"click": cmd_step_out,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#000";
						ctx.fillRect(10,  3, 7, 2);
						ctx.fillRect(13,  6, 4, 2);
						ctx.fillRect(13,  9, 4, 2);
						ctx.fillRect(13, 12, 4, 2);
						ctx.fillRect(10, 15, 7, 2);
						ctx.lineWidth = 1;
						ctx.strokeStyle = "#00f";
						ctx.beginPath();
						ctx.moveTo(11, 10);
						ctx.lineTo(3, 10);
						ctx.lineTo(3, 16);
						ctx.lineTo(6, 16);
						ctx.stroke();
						ctx.fillStyle = "#00f";
						ctx.beginPath();
						ctx.moveTo(5, 13);
						ctx.lineTo(5, 19);
						ctx.lineTo(9.5, 16);
						ctx.fill();
					},
			"tooltip": "step out of the current function",
			"hotkey": "shift-F11",
		},
		{
			"click": cmd_toggle_breakpoint,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#c00";
						ctx.arc(9.5, 9.5, 4.0, 0, 2 * Math.PI, false);
						ctx.fill();
					},
			"tooltip": "toggle breakpoint",
			"hotkey": "F8",
		},
	];

// load hotkeys
function loadConfig()
{
//return null;   // don'load buggy NaN and null data
	let str = localStorage.getItem("tscript.ide.config");
	if (str)
	{
		let config = JSON.parse(str);
		if (config.hasOwnProperty("hotkeys"))
		{
			let n = Math.min(buttons.length, config.hotkeys.length);
			for (let i=0; i<n; i++)
			{
				buttons[i].hotkey = config.hotkeys[i];
			}
		}
	}
	return null;
}
loadConfig();

// save hotkeys
function saveConfig()
{
	let config = {"hotkeys": []};
	for (let i=0; i<buttons.length; i++)
	{
		config.hotkeys.push(buttons[i].hotkey);
	}
	localStorage.setItem("tscript.ide.config", JSON.stringify(config));
}

function configDlg()
{
	let dlg = tgui.createElement({
			"type": "div",
			"style": {"position": "fixed", "width": "50vw", "left": "25vw", "height": "50vh", "top": "25vh", "background": "#eee"},
			"html": "<h3>Configure Hotkeys</h3><p>Click a button to configure its hotkey, or press escape to exit.</p>",
		});
	dlg.onKeyDown = function(event)
			{
				if (event.key == "Escape")
				{
					saveConfig();
					tgui.stopModal();
					event.preventDefault();
					event.stopPropagation();
					return false;
				}
			};
	let dlg_buttons = [];
	for (let i=0; i<buttons.length; i++)
	{
		let description = Object.assign({}, buttons[i]);
		description.width = 20;
		description.height = 20;
		description.style = {"float": "left", "height": "22px"};
		if (description.hotkey) description.tooltip += " (" + description.hotkey + ")";
		delete description.hotkey;
		description.parent = dlg;
		{
			let btn = i;
			description.click = function()
					{
						let dlg = tgui.createElement({
								"type": "div",
								"style": {"position": "fixed", "width": "30vw", "left": "35vw", "height": "30vh", "top": "35vh", "background": "#eee"},
								"html": "<p>press the hotkey to assign, or press escape to remove the current hotkey</p>",
							});
						dlg.onKeyDown = function(event)
								{
									event.preventDefault();
									event.stopPropagation();

									let key = event.key;
									if (key == "Shift" || key == "Control" || key == "Alt" || key == "OS" || key == "Meta") return;
									if (buttons[btn].hotkey)
									{
										tgui.setTooltip(buttons[btn].control.dom, buttons[btn].tooltip);
										tgui.setTooltip(dlg_buttons[btn].dom, buttons[btn].tooltip);
										tgui.releaseHotkey(buttons[btn].hotkey);
										delete buttons[btn].hotkey;
									}
									if (key == "Escape")
									{
										tgui.stopModal();
										return false;
									}

									if (event.altKey) key = "alt-" + key;
									if (event.ctrlKey) key = "control-" + key;
									if (event.shiftKey) key = "shift-" + key;
									key = tgui.normalizeHotkey(key);

									if (tgui.hotkey(key))
									{
										alert("hotkey " + key + " is already in use");
									}
									else
									{
										buttons[btn].hotkey = key;
										tgui.setHotkey(key, buttons[btn].click);
										tgui.setTooltip(buttons[btn].control.dom, buttons[btn].tooltip + " (" + key + ")");
										tgui.setTooltip(dlg_buttons[btn].dom, buttons[btn].tooltip + " (" + key + ")");
										tgui.stopModal();
									}
									return false;
								};
						tgui.startModal(dlg);
					};
		}
		dlg_buttons.push(tgui.createButton(description));
	}

	tgui.startModal(dlg);
}

function fileDlg(title, filename, allowNewFilename, onOkay)
{
	// populate array of existing files
	let files = [];
	for (let key in localStorage)
	{
		if (key.substr(0, 13) == "tscript_code_") files.push(key.substr(13));
	}
	files.sort();

	// create controls
	let dlg = tgui.createElement({
			"type": "div",
			"style": {"position": "fixed", "width": "50vw", "left": "25vw", "height": "70vh", "top": "15vh", "background": "#eee", "overflow": "hidden"},
		});
	let titlebar = tgui.createElement({
			"parent": dlg,
			"type": "div",
			"style": {"position": "absolute", "width": "50vw", "left": "0", "height": "20px", "top": "0", "background": "#008", "color": "#fff", "padding": "2px 10px"},
			"text": title,
		});
	let list = tgui.createElement({
			"parent": dlg,
			"type": "select",
			"properties": {"size": Math.max(2, files.length)},
			"style": {"position": "absolute", "width": "46vw", "left": "2vw", "height": "calc(70vh - 80px)", "top": "30px", "background": "#fff", "overflow": "scroll"},
		});
	let name = {value: filename};
	if (allowNewFilename)
	{
		name = tgui.createElement({
				"parent": dlg,
				"type": "input",
				"style": {"position": "absolute", "width": "calc(46vw - 120px)", "left": "2vw", "height": "20px", "bottom": "10px", "background": "#fff"},
				"text": filename,
			});
	}
	let okay = tgui.createElement({
			"parent": dlg,
			"type": "button",
			"style": {"position": "absolute", "width": "100px", "right": "2vw", "height": "25px", "bottom": "10px"},
			"text": "Okay",
		});

	// populate options
	for (let i=0; i<files.length; i++)
	{
		let option = new Option(files[i], files[i]);
		list.options[i] = option;
	}

	// event handlers
	list.addEventListener("change", function(event)
			{
				if (event.target && event.target.value) name.value = event.target.value;
			});
	list.addEventListener("keydown", function(event)
			{
				if (event.key == "Backspace" || event.key == "Delete")
				{
					event.preventDefault();
					event.stopPropagation();
					let fn = name.value;
					let index = files.indexOf(fn);
					if (index >= 0)
					{
						if (confirm("Delete file \"" + fn + "\"\nAre you sure?"))
						{
							delete localStorage.removeItem("tscript_code_" + fn);
							files.splice(index, 1);
							list.remove(index);
						}
					}
					return false;
				}
			});
	okay.addEventListener("click", function(event)
			{
				event.preventDefault();
				event.stopPropagation();
				let fn = name.value;
				if (fn != "")
				{
					if (allowNewFilename || files.indexOf(fn) >= 0)
					{
						tgui.stopModal();
						onOkay(fn);
					}
				}
				return false;
			});

	dlg.onKeyDown = function(event)
			{
				if (event.key == "Escape")
				{
					tgui.stopModal();
					event.preventDefault();
					event.stopPropagation();
					return false;
				}
				else if (event.key == "Enter")
				{
					event.preventDefault();
					event.stopPropagation();
					let fn = name.value;
					if (fn != "")
					{
						if (allowNewFilename || files.indexOf(fn) >= 0)
						{
							tgui.stopModal();
							onOkay(fn);
						}
					}
					return false;
				}
			};

	// go!
	tgui.startModal(dlg);
	(allowNewFilename ? name : list).focus();
	return dlg;
}

module.create = function()
{
	// create HTML elements of the GUI
	module.main = tgui.createElement({"type": "div", "parent": document.body, "classname": "ide ide-main"});

	module.toolbar = tgui.createElement({"type": "div", "parent": module.main, "classname": "ide ide-toolbar"});

	// prepare menu bar
	let sep = [false, false, false, true, false, false, true, false, false, false, true];
	for (let i=0; i<buttons.length; i++)
	{
		let description = Object.assign({}, buttons[i]);
		description.width = 20;
		description.height = 20;
		description.style = {"float": "left", "height": "22px"};
		if (description.hotkey) description.tooltip += " (" + description.hotkey + ")";
		description.parent = module.toolbar;
		buttons[i].control = tgui.createButton(description);

		if (sep[i])
		{
			tgui.createElement({
						"type": "div",
						"parent": module.toolbar,
						"classname":
						"tgui tgui-control",
						"style": {
							"float": "left",
							"width": "1px",
							"height": "22px",
							"background": "#666",
							"margin": "3px 10px 3px 10px"
							}
						});
		}
	}

	tgui.createButton({
			"click": function ()
					{
						configDlg();
						return false;
					},
			"width": 20,
			"height": 20,
			"draw": function(canvas)
					{
						let ctx = canvas.getContext("2d");
						ctx.fillStyle = "#000";
						ctx.strokeStyle = "#000";
						ctx.arc(9.5, 9.5, 2.0, 0, 2 * Math.PI, false);
						ctx.fill();
						ctx.lineWidth = 3;
						ctx.strokeStyle = "#000";
						ctx.beginPath();
						ctx.arc(9.5, 9.5, 5.7, 0, 2 * Math.PI, false);
						ctx.stroke();
						ctx.lineWidth = 2;
						ctx.beginPath();
						for (let i=0; i<12; i++)
						{
							let a = i * Math.PI / 6;
							ctx.moveTo(9.5 + 6.0 * Math.cos(a), 9.5 + 6.0 * Math.sin(a));
							ctx.lineTo(9.5 + 8.8 * Math.cos(a), 9.5 + 8.8 * Math.sin(a));
						}
						ctx.stroke();
					},
			"parent": module.toolbar,
			"style": {"float": "left"},
			"tooltip": "configuration",
		});

	tgui.createElement({
				"type": "div",
				"parent": module.toolbar,
				"classname": "tgui tgui-control",
				"style": {
						"float": "left",
						"width": "1px",
						"height": "22px",
						"background": "#666",
						"margin": "3px 10px 3px 10px"
					},
				});

	module.programstate = tgui.createLabel({
				"parent": module.toolbar,
				"style": {
					"float": "left",
					"width": "250px",
					"text-align": "center",
					"background": "#fff"
					}
		});
	module.programstate.unchecked = function() { this.setText("program has not been checked").setBackground("#ee8"); }
	module.programstate.error = function() { this.setText("an error has occurred").setBackground("#f44"); }
	module.programstate.running = function() { this.setText("program is running").setBackground("#8e8"); }
	module.programstate.waiting = function() { this.setText("program is waiting").setBackground("#aca"); }
	module.programstate.stepping = function() { this.setText("program is in stepping mode").setBackground("#8ee"); }
	module.programstate.finished = function() { this.setText("program has finished").setBackground("#88e"); }
	module.programstate.unchecked();

	tgui.createElement({
				"type": "div",
				"parent": module.toolbar,
				"classname": "tgui tgui-control",
				"style": {
						"float": "left",
						"width": "1px",
						"height": "22px",
						"background": "#666",
						"margin": "3px 10px 3px 10px"
					},
				});

	module.iconlist = tgui.createElement({
			"type": "div",
			"parent": module.toolbar,
			"classname": "tgui",
				"style": {
						"float": "left",
						"width": "200px",
						"height": "100%",
						"border": "none",
						"margin": "3px",
					},
		});

	tgui.createElement({
				"type": "div",
				"parent": module.toolbar,
				"classname": "tgui tgui-control",
				"style": {
						"float": "left",
						"width": "1px",
						"height": "22px",
						"background": "#666",
						"margin": "3px 10px 3px 10px"
					},
				});

	tgui.createButton({
			"click": function ()
					{
						showdoc();
						return false;
					},
			"text": "documentation",
			"parent": module.toolbar,
			"style": {"float": "right"},
		});

	// area containing all panels
	let area = tgui.createElement({"type": "div", "parent": module.main, "classname": "ide ide-panel-area"});

	// prepare tgui panels
	tgui.preparePanels(area, module.iconlist);

	let panel_editor = tgui.createPanel({
			"title": "editor",
			"state": "left",
			"fallbackState": "float",
			"dockedheight": 600,
			"onArrange": function()
			{
				if (module.sourcecode) module.sourcecode.refresh();
			},
		});
	panel_editor.textarea = tgui.createElement({"type": "textarea", "parent": panel_editor.content, "classname": "ide ide-sourcecode"});
	module.sourcecode = CodeMirror.fromTextArea(panel_editor.textarea, {
			gutters: ["CodeMirror-linenumbers", "breakpoints"],
			lineNumbers: true,
			matchBrackets: true,
			styleActiveLine: true,
			mode: "text/tscript",
			indentUnit: 4,
			tabSize: 4,
			indentWithTabs: true,
			extraKeys: {
					"Ctrl-D": "toggleComment",
					"Cmd-D": "toggleComment",
					"Ctrl-Up": "scrollUp",
					"Ctrl-Down": "scrollDown",
					"Shift-Tab": "unindent",
				},
		});
	module.sourcecode.on("change", function(cm, changeObj)
			{
				module.document.dirty = true;
				if (module.interpreter)
				{
					clear();
					updateControls();
				}
			});
	module.sourcecode.on("gutterClick", function(cm, line)
			{
				if (module.interpreter)
				{
					// ask the interpreter for the correct position of the marker
					let result = module.interpreter.toggleBreakpoint(line+1);
					if (result !== null)
					{
						line = result.line;
						cm.setGutterMarker(line-1, "breakpoints", result.active ? makeMarker() : null);
						module.sourcecode.scrollIntoView({"line": line}, 40);
					}
				}
				else
				{
					// set the marker optimistically, fix as soon as an interpreter is created
					cm.setGutterMarker(line, "breakpoints", cm.lineInfo(line).gutterMarkers ? null : makeMarker());
				}
			});
	module.editor_title = panel_editor.titlebar;

	let panel_messages = tgui.createPanel({
			"title": "messages",
			"state": "left",
			"dockedheight": 200,
		});
	module.messagecontainer = tgui.createElement({"type": "div", "parent": panel_messages.content, "classname": "ide ide-messages"});
	module.messages = tgui.createElement({"type": "table", "parent": module.messagecontainer, "classname": "ide", "style": {"width": "100%"}});

	// prepare stack tree control
	let panel_stackview = tgui.createPanel({
			"title": "stack",
			"state": "icon",
			"fallbackState": "right",
		});
	module.stacktree = tgui.createTreeControl({"parent": panel_stackview.content});

	// prepare program tree control
	let panel_programview = tgui.createPanel({
			"title": "program",
			"state": "icon",
			"fallbackState": "right",
		});
	module.programtree = tgui.createTreeControl({
			"parent": panel_programview.content,
			"nodeclick": function(event, value, id)
					{
						if (value.where)
						{
							setCursorPosition(value.where.line, value.where.ch);
						}
					},
		});

	// prepare turtle output panel
	let panel_turtle = tgui.createPanel({
			"title": "turtle",
			"state": "right",
			"fallbackState": "float",
		});
	module.turtle = tgui.createElement({
			"type": "canvas",
			"parent": panel_turtle.content,
			"properties": {"width": 600, "height": 600},
			"classname": "ide ide-turtle",
		});
	module.turtle.addEventListener("contextmenu", function(event) { event.preventDefault(); return false; });
	module.turtle.turtle_position = [0, 0];
	module.turtle.turtle_angle = 0;
	module.turtle.turtle_pen = true;

	function createTypedEvent(displayname, dict)
	{
		if (! module.interpreter) throw new Error("[createTypedEvent] internal error");
		let p = module.interpreter.program;
		for (let idx=10; idx<p.types.length; idx++)
		{
			let t = p.types[idx];
			if (t.displayname == displayname)
			{
				// create the object without calling the constructor, considering default values, etc
				let obj = { "type": t, "value": { "a": [] } };
				let n = {"type": p.types[module.typeid_null], "value": {"b": null}};
				for (let i=0; i<t.objectsize; i++) obj.value.a.push(n);

				// fill its attributes
				for (let key in t.members)
				{
					if (! dict.hasOwnProperty(key)) continue;
					obj.value.a[t.members[key].id] = TScript.json2typed.call(module.interpreter, dict[key]);
				}
				return obj;
			}
		}
		throw new Error("[createTypedEvent] unknown type " + displayname);
	}

	// prepare canvas output panel
	let panel_canvas = tgui.createPanel({
			"title": "canvas",
			"state": "icon",
			"fallbackState": "right",
			"onResize": function(w, h)
					{
						if (module.canvas)
						{
							module.canvas.width = w;
							module.canvas.height = h;
						}
						if (module.interpreter)
						{
							let e = {"width": w, "height": h};
							e = createTypedEvent("canvas.ResizeEvent", e);
							module.interpreter.enqueueEvent("canvas.resize", e);
						}
					},
		});
	module.canvas = tgui.createElement({
			"type": "canvas",
			"parent": panel_canvas.content,
			"properties": {"width": panel_canvas.content.clientWidth, "height": panel_canvas.content.clientHeight},
			"classname": "ide ide-canvas",
		});
	module.canvas.addEventListener("contextmenu", function(event) { event.preventDefault(); return false; });
	panel_canvas.content.tabIndex = -1;
	panel_canvas.size = [0, 0];
	module.canvas.font_size = 16;
	function buttonName(button)
	{
		if (button == 0) return "left";
		else if (button == 1) return "middle";
		else return "right";
	}
	function buttonNames(buttons)
	{
		let ret = [];
		if (buttons & 1) ret.push("left");
		if (buttons & 4) ret.push("middle");
		if (buttons & 2) ret.push("right");
		return ret;
	}
	let ctx = module.canvas.getContext("2d");
	ctx.lineWidth = 1;
	ctx.fillStyle = "#000";
	ctx.strokeStyle = "#000";
	ctx.font = "16px Helvetica";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	module.canvas.addEventListener("mousedown", function(event) {
				if (! module.interpreter || ! module.interpreter.background || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) return;
				let e = {
						"button": buttonName(event.button),
						"buttons": buttonNames(event.buttons),
						"shift": event.shiftKey,
						"control": event.ctrlKey,
						"alt": event.altKey,
						"meta": event.metaKey,
					};
				e = Object.assign(e, relpos(module.canvas, event.pageX, event.pageY));
				e = createTypedEvent("canvas.MouseButtonEvent", e);
				module.interpreter.enqueueEvent("canvas.mousedown", e);
			});
	module.canvas.addEventListener("mouseup", function(event) {
				if (! module.interpreter || ! module.interpreter.background || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) return;
				let e = {
						"button": buttonName(event.button),
						"buttons": buttonNames(event.buttons),
						"shift": event.shiftKey,
						"control": event.ctrlKey,
						"alt": event.altKey,
						"meta": event.metaKey,
					};
				e = Object.assign(e, relpos(module.canvas, event.pageX, event.pageY));
				e = createTypedEvent("canvas.MouseButtonEvent", e);
				module.interpreter.enqueueEvent("canvas.mouseup", e);
			});
	module.canvas.addEventListener("mousemove", function(event) {
				if (! module.interpreter || ! module.interpreter.background || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) return;
				let e = {
						"button": 0,
						"buttons": buttonNames(event.buttons),
						"shift": event.shiftKey,
						"control": event.ctrlKey,
						"alt": event.altKey,
						"meta": event.metaKey,
					};
				e = Object.assign(e, relpos(module.canvas, event.pageX, event.pageY));
				e = createTypedEvent("canvas.MouseMoveEvent", e);
				module.interpreter.enqueueEvent("canvas.mousemove", e);
			});
	module.canvas.addEventListener("mouseout", function(event) {
				if (! module.interpreter || ! module.interpreter.background || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) return;
				let e = {"type": module.interpreter.program.types[module.typeid_null], "value": {"b": null}};
				module.interpreter.enqueueEvent("canvas.mouseout", e);
			});
	panel_canvas.content.addEventListener("keydown", function(event) {
				if (! module.interpreter || ! module.interpreter.background || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) return;
				let e = {
						"key": event.key,
						"shift": event.shiftKey,
						"control": event.ctrlKey,
						"alt": event.altKey,
						"meta": event.metaKey,
					};
				e = createTypedEvent("canvas.KeyboardEvent", e);
				module.interpreter.enqueueEvent("canvas.keydown", e);
			});
	panel_canvas.content.addEventListener("keyup", function(event) {
				if (! module.interpreter || ! module.interpreter.background || (module.interpreter.status != "running" && module.interpreter.status != "waiting")) return;
				let e = {
						"key": event.key,
						"shift": event.shiftKey,
						"control": event.ctrlKey,
						"alt": event.altKey,
						"meta": event.metaKey,
					};
				e = createTypedEvent("canvas.KeyboardEvent", e);
				module.interpreter.enqueueEvent("canvas.keyup", e);
			});
	tgui.arrangePanels();

	module.sourcecode.focus();
}

return module;
}());

if (ide) window.addEventListener("load", ide.create, false);