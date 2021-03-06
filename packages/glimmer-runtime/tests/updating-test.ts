import { compile } from "glimmer-compiler";
import { DOMHelper, Template, manualElement } from "glimmer-runtime";
import { equalTokens } from "glimmer-test-helpers";
import { TestEnvironment } from "./support";

var hooks, dom, root;
let env: TestEnvironment;

function rootElement() {
  return env.getDOM().createElement('div', document.body);
}

function commonSetup() {
  env = new TestEnvironment(window.document); // TODO: Support SimpleDOM
  root = rootElement();
}

function render(template: Template, context={}) {
  let result = template.render(context, env, { appendTo: root });
  assertInvariants(result);
  return result;
}

QUnit.module("Updating", {
  beforeEach: commonSetup
});

test("updating a single curly", () => {
  var object = { value: 'hello world' };
  var template = compile('<div><p>{{value}}</p></div>');
  var result = render(template, object);
  var valueNode = root.firstChild.firstChild.firstChild;

  equalTokens(root, '<div><p>hello world</p></div>', "Initial render");

  result.rerender();

  equalTokens(root, '<div><p>hello world</p></div>', "no change");
  strictEqual(root.firstChild.firstChild.firstChild, valueNode, "The text node was not blown away");

  object.value = 'goodbye world';
  result.rerender();

  equalTokens(root, '<div><p>goodbye world</p></div>', "After updating and dirtying");
  strictEqual(root.firstChild.firstChild.firstChild, valueNode, "The text node was not blown away");
});

test("updating a single trusting curly", () => {
  var object = { value: '<p>hello world</p>' };
  var template = compile('<div>{{{value}}}</div>');
  var result = render(template, object);
  var valueNode = root.firstChild.firstChild.firstChild;

  equalTokens(root, '<div><p>hello world</p></div>', "Initial render");

  result.rerender();

  equalTokens(root, '<div><p>hello world</p></div>', "no change");
  strictEqual(root.firstChild.firstChild.firstChild, valueNode, "The text node was not blown away");

  object.value = '<span>goodbye world</span>';
  result.rerender();

  equalTokens(root, '<div><span>goodbye world</span></div>', "After updating and dirtying");
  notStrictEqual(root.firstChild.firstChild.firstChild, valueNode, "The text node was not blown away");
});

test("a simple implementation of a dirtying rerender", function() {
  var object = { condition: true, value: 'hello world' };
  var template = compile('<div>{{#if condition}}<p>{{value}}</p>{{else}}<p>Nothing</p>{{/if}}</div>');
  var result = render(template, object);
  var valueNode = root.firstChild.firstChild.firstChild;

  equalTokens(root, '<div><p>hello world</p></div>', "Initial render");

  result.rerender();

  equalTokens(root, '<div><p>hello world</p></div>', "After dirtying but not updating");
  strictEqual(root.firstChild.firstChild.firstChild, valueNode, "The text node was not blown away");

  // Even though the #if was stable, a dirty child node is updated
  object.value = 'goodbye world';
  result.rerender();
  equalTokens(root, '<div><p>goodbye world</p></div>', "After updating and dirtying");
  strictEqual(root.firstChild.firstChild.firstChild, valueNode, "The text node was not blown away");

  object.condition = false;
  result.rerender();
  equalTokens(root, '<div><p>Nothing</p></div>', "And then dirtying");
  QUnit.notStrictEqual(root.firstChild.firstChild.firstChild, valueNode, "The text node was not blown away");
});

test("a simple implementation of a dirtying rerender without inverse", function() {
  var object = { condition: true, value: 'hello world' };
  var template = compile('<div>{{#if condition}}<p>{{value}}</p>{{/if}}</div>');
  var result = render(template, object);

  equalTokens(root, '<div><p>hello world</p></div>', "Initial render");

  object.condition = false;

  result.rerender();
  equalTokens(root, '<div><!----></div>', "If the condition is false, the morph becomes empty");

  object.condition = true;

  result.rerender();
  equalTokens(root, '<div><p>hello world</p></div>', "If the condition is true, the morph repopulates");
});

test("a conditional that is false on the first run", assert => {
  var object = { condition: false, value: 'hello world' };
  var template = compile('<div>{{#if condition}}<p>{{value}}</p>{{/if}}</div>');
  var result = render(template, object);

  equalTokens(root, '<div><!----></div>', "Initial render");

  object.condition = true;

  result.rerender();
  equalTokens(root, '<div><p>hello world</p></div>', "If the condition is true, the morph populates");

  object.condition = false;

  result.rerender();
  equalTokens(root, '<div><!----></div>', "If the condition is false, the morph is empty");
});

test("block arguments", assert => {
  let template = compile("<div>{{#with person.name.first as |f|}}{{f}}{{/with}}</div>");

  let object = { person: { name: { first: "Godfrey", last: "Chan" } } };
  let result = render(template, object);

  equalTokens(root, '<div>Godfrey</div>', "Initial render");

  object.person.name.first = "Godfreak";
  result.rerender();

  equalTokens(root, '<div>Godfreak</div>', "After updating");
});

test("block arguments (ensure balanced push/pop)", assert => {
  env.registerHelper('with', (params, hash, blocks) => {
    blocks.template.yield([ params[0] ]);
  });

  let template = compile("<div>{{#with person.name.first as |f|}}{{f}}{{/with}}{{f}}</div>");

  let object = { person: { name: { first: "Godfrey", last: "Chan" } }, f: "Outer" };
  let result = render(template, object);

  equalTokens(root, '<div>GodfreyOuter</div>', "Initial render");

  object.person.name.first = "Godfreak";
  result.rerender();

  equalTokens(root, '<div>GodfreakOuter</div>', "After updating");
});

test("block helpers whose template has a morph at the edge", function() {
  var template = compile("{{#identity}}{{value}}{{/identity}}");
  var object = { value: "hello world" };
  let result = render(template, object);

  equalTokens(root, 'hello world');
  var firstNode = result.firstNode();
  equal(firstNode.nodeType, 3, "the first node of the helper should be a text node");
  equal(firstNode.nodeValue, "hello world", "its content should be hello world");

  strictEqual(firstNode.nextSibling, null, "there should only be one nodes");
});

function assertInvariants(result, msg?) {
  strictEqual(result.firstNode(), root.firstChild, `The firstNode of the result is the same as the root's firstChild${msg ? ': ' + msg : ''}`);
  strictEqual(result.lastNode(), root.lastChild, `The lastNode of the result is the same as the root's lastChild${msg ? ': ' + msg : ''}`);
}

test("clean content doesn't get blown away", function() {
  var template = compile("<div>{{value}}</div>");
  var object = { value: "hello" };
  var result = render(template, object);

  var textNode = result.firstNode().firstChild;
  equal(textNode.nodeValue, "hello");

  object.value = "goodbye";
  result.rerender();

  equalTokens(root, '<div>goodbye</div>');

  object.value = "hello";
  result.rerender();

  textNode = root.firstChild.firstChild;
  equal(textNode.nodeValue, "hello");
});

test("helper calls follow the normal dirtying rules", function() {
  env.registerHelper('capitalize', function(params) {
    return params[0].toUpperCase();
  });

  var template = compile("<div>{{capitalize value}}</div>");
  var object = { value: "hello" };
  var result = render(template, object);

  var textNode = result.firstNode().firstChild;
  equal(textNode.nodeValue, "HELLO");

  object.value = "goodbye";
  result.rerender();

  equalTokens(root, '<div>GOODBYE</div>');

  result.rerender();

  equalTokens(root, '<div>GOODBYE</div>');

  // Checks normalized value, not raw value
  object.value = "GoOdByE";
  result.rerender();

  textNode = root.firstChild.firstChild;
  equal(textNode.nodeValue, "GOODBYE");
});

test("class attribute follow the normal dirtying rules", function() {
  var template = compile("<div class='{{value}}'>hello</div>");
  var object = { value: "world" };

  var result = render(template, object);

  equalTokens(root, "<div class='world'>hello</div>", "Initial render");

  object.value = "universe";
  result.rerender(); // without setting the node to dirty

  equalTokens(root, "<div class='universe'>hello</div>", "Revalidating without dirtying");

  result.rerender();

  equalTokens(root, "<div class='universe'>hello</div>", "Revalidating after dirtying");

  object.value = "world";
  result.rerender();

  equalTokens(root, "<div class='world'>hello</div>", "Revalidating after dirtying");
});

test("class attribute w/ concat follow the normal dirtying rules", function() {
  var template = compile("<div class='hello {{value}}'>hello</div>");
  var object = { value: "world" };
  var result = render(template, object);

  equalTokens(root, "<div class='hello world'>hello</div>");

  object.value = "universe";
  result.rerender(); // without setting the node to dirty

  equalTokens(root, "<div class='hello universe'>hello</div>");

  result.rerender();

  equalTokens(root, "<div class='hello universe'>hello</div>");

  object.value = "world";
  result.rerender();

  equalTokens(root, "<div class='hello world'>hello</div>");
});

test("attribute nodes follow the normal dirtying rules", function() {
  var template = compile("<div data-value='{{value}}'>hello</div>");
  var object = { value: "world" };

  var result = render(template, object);

  equalTokens(root, "<div data-value='world'>hello</div>", "Initial render");

  object.value = "universe";
  result.rerender(); // without setting the node to dirty

  equalTokens(root, "<div data-value='universe'>hello</div>", "Revalidating without dirtying");

  result.rerender();

  equalTokens(root, "<div data-value='universe'>hello</div>", "Revalidating after dirtying");

  object.value = "world";
  result.rerender();

  equalTokens(root, "<div data-value='world'>hello</div>", "Revalidating after dirtying");
});

test("attribute nodes w/ concat follow the normal dirtying rules", function() {
  var template = compile("<div data-value='hello {{value}}'>hello</div>");
  var object = { value: "world" };
  var result = render(template, object);

  equalTokens(root, "<div data-value='hello world'>hello</div>");

  object.value = "universe";
  result.rerender(); // without setting the node to dirty

  equalTokens(root, "<div data-value='hello universe'>hello</div>");

  result.rerender();

  equalTokens(root, "<div data-value='hello universe'>hello</div>");

  object.value = "world";
  result.rerender();

  equalTokens(root, "<div data-value='hello world'>hello</div>");
});

test("property nodes follow the normal dirtying rules", function() {
  var template = compile("<div foo={{value}}>hello</div>");
  var object = { value: true };

  var result = render(template, object);

  equalTokens(root, "<div>hello</div>", "Initial render");
  strictEqual(root.firstChild.foo, true, "Initial render");

  object.value = false;
  result.rerender(); // without setting the node to dirty

  equalTokens(root, "<div>hello</div>", "Revalidating without dirtying");
  strictEqual(root.firstChild.foo, false, "Revalidating without dirtying");

  result.rerender();

  equalTokens(root, "<div>hello</div>", "Revalidating after dirtying");
  strictEqual(root.firstChild.foo, false, "Revalidating after dirtying");

  object.value = true;
  result.rerender();

  equalTokens(root, "<div>hello</div>", "Revalidating after dirtying");
  strictEqual(root.firstChild.foo, true, "Revalidating after dirtying");
});

test("top-level bounds are correct when swapping order", assert => {
  var template = compile("{{#each list key='key' as |item|}}{{item.name}}{{/each}}");

  let tom = { key: "1", name: "Tom Dale", "class": "tomdale" };
  var yehuda = { key: "2", name: "Yehuda Katz", "class": "wycats" };
  var object = { list: [ tom, yehuda ] };

  var result = render(template, object);
  assertInvariants(result, "initial render");

  result.rerender();
  assertInvariants(result, "after no-op rerender");

  object = { list: [yehuda, tom] };
  result.rerender(object);
  assertInvariants(result, "after reordering");

  object = { list: [tom] };
  result.rerender(object);
  assertInvariants(result, "after deleting from the front");

  object = { list: [] };
  result.rerender(object);
  assertInvariants(result, "after emptying the list");
});

testEachHelper(
  "An implementation of #each using block params",
  "<ul>{{#each list key='key' as |item|}}<li class='{{item.class}}'>{{item.name}}</li>{{/each}}</ul>"
);

testEachHelper(
  "An implementation of #each using a self binding",
  "<ul>{{#each list}}<li class={{class}}>{{name}}</li>{{/each}}</ul>",
  QUnit.skip
);

function testEachHelper(testName, templateSource, testMethod=QUnit.test) {
  testMethod(testName, function() {
    let template = compile(templateSource);
    let tom = { key: "1", name: "Tom Dale", "class": "tomdale" };
    var yehuda = { key: "2", name: "Yehuda Katz", "class": "wycats" };
    var object = { list: [ tom, yehuda ] };

    var result = render(template, object);

    var itemNode = getItemNode('tomdale');
    var nameNode = getNameNode('tomdale');

    equalTokens(root, "<ul><li class='tomdale'>Tom Dale</li><li class='wycats'>Yehuda Katz</li><!----></ul>", "Initial render");

    rerender();
    assertStableNodes('tomdale', "after no-op rerender");
    equalTokens(root, "<ul><li class='tomdale'>Tom Dale</li><li class='wycats'>Yehuda Katz</li><!----></ul>", "After no-op re-render");

    rerender();
    assertStableNodes('tomdale', "after non-dirty rerender");
    equalTokens(root, "<ul><li class='tomdale'>Tom Dale</li><li class='wycats'>Yehuda Katz</li><!----></ul>", "After no-op re-render");

    object = { list: [yehuda, tom] };
    rerender(object);
    assertStableNodes('tomdale', "after changing the list order");
    equalTokens(root, "<ul><li class='wycats'>Yehuda Katz</li><li class='tomdale'>Tom Dale</li><!----></ul>", "After changing the list order");

    object = { list: [
      { key: "1", name: "Martin Muñoz", "class": "mmun" },
      { key: "2", name: "Kris Selden", "class": "krisselden" }
    ]};
    rerender(object);
    assertStableNodes('mmun', "after changing the list entries, but with stable keys");
    equalTokens(root, "<ul><li class='mmun'>Martin Muñoz</li><li class='krisselden'>Kris Selden</li><!----></ul>", "After changing the list entries, but with stable keys");

    object = { list: [
      { key: "1", name: "Martin Muñoz", "class": "mmun" },
      { key: "2", name: "Kristoph Selden", "class": "krisselden" },
      { key: "3", name: "Matthew Beale", "class": "mixonic" }
    ]};
    rerender(object);
    assertStableNodes('mmun', "after adding an additional entry");
    equalTokens(root, "<ul><li class='mmun'>Martin Muñoz</li><li class='krisselden'>Kristoph Selden</li><li class='mixonic'>Matthew Beale</li><!----></ul>", "After adding an additional entry");

    object = { list: [
      { key: "1", name: "Martin Muñoz", "class": "mmun" },
      { key: "3", name: "Matthew Beale", "class": "mixonic" }
    ]};

    rerender(object);
    assertStableNodes('mmun', "after removing the middle entry");
    equalTokens(root, "<ul><li class='mmun'>Martin Muñoz</li><li class='mixonic'>Matthew Beale</li><!----></ul>", "after removing the middle entry");

    object = { list: [
      { key: "1", name: "Martin Muñoz", "class": "mmun" },
      { key: "4", name: "Stefan Penner", "class": "stefanpenner" },
      { key: "5", name: "Robert Jackson", "class": "rwjblue" }
    ]};

    rerender(object);
    assertStableNodes('mmun', "after adding two more entries");
    equalTokens(root, "<ul><li class='mmun'>Martin Muñoz</li><li class='stefanpenner'>Stefan Penner</li><li class='rwjblue'>Robert Jackson</li><!----></ul>", "After adding two more entries");

    // New node for stability check
    itemNode = getItemNode('rwjblue');
    nameNode = getNameNode('rwjblue');

    object = { list: [
      { key: "5", name: "Robert Jackson", "class": "rwjblue" }
    ]};

    rerender(object);
    assertStableNodes('rwjblue', "after removing two entries");
    equalTokens(root, "<ul><li class='rwjblue'>Robert Jackson</li><!----></ul>", "After removing two entries");

    object = { list: [
      { key: "1", name: "Martin Muñoz", "class": "mmun" },
      { key: "4", name: "Stefan Penner", "class": "stefanpenner" },
      { key: "5", name: "Robert Jackson", "class": "rwjblue" }
    ]};

    console.log("adding back");
    rerender(object);
    assertStableNodes('rwjblue', "after adding back entries");
    equalTokens(root, "<ul><li class='mmun'>Martin Muñoz</li><li class='stefanpenner'>Stefan Penner</li><li class='rwjblue'>Robert Jackson</li><!----></ul>", "After adding back entries");

    // New node for stability check
    itemNode = getItemNode('mmun');
    nameNode = getNameNode('mmun');

    object = { list: [
      { key: "1", name: "Martin Muñoz", "class": "mmun" }
    ]};

    rerender(object);
    assertStableNodes('mmun', "after removing from the back");
    equalTokens(root, "<ul><li class='mmun'>Martin Muñoz</li><!----></ul>", "After removing from the back");

    object = { list: [] };

    rerender(object);
    strictEqual(root.firstChild.firstChild.nodeType, 8, "there are no li's after removing the remaining entry");
    equalTokens(root, "<ul><!----></ul>", "After removing the remaining entries");

    function rerender(context?) {
      result.rerender(context);
    }

    function assertStableNodes(className, message) {
      strictEqual(getItemNode(className), itemNode, "The item node has not changed " + message);
      strictEqual(getNameNode(className), nameNode, "The name node has not changed " + message);
    }

    function getItemNode(className) {
      // <li>
      var itemNode = root.firstChild.firstChild;

      while (itemNode && itemNode.getAttribute) {
        if (itemNode.getAttribute('class') === className) { break; }
        itemNode = itemNode.nextSibling;
      }

      ok(itemNode, "Expected node with class='" + className + "'");
      return itemNode;
    }

    function getNameNode(className) {
      // {{item.name}}
      var itemNode = getItemNode(className);
      ok(itemNode, "Expected child node of node with class='" + className + "', but no parent node found");

      var childNode = itemNode && itemNode.firstChild;
      ok(childNode, "Expected child node of node with class='" + className + "', but not child node found");

      return childNode;
    }
  });
}

var destroyedRenderNodeCount;
var destroyedRenderNode;

QUnit.module("HTML-based compiler (dirtying) - pruning", {
  beforeEach: function() {
    commonSetup();
    destroyedRenderNodeCount = 0;
    destroyedRenderNode = null;

    hooks.destroyRenderNode = function(renderNode) {
      destroyedRenderNode = renderNode;
      destroyedRenderNodeCount++;
    };
  }
});

QUnit.skip("Pruned render nodes invoke a cleanup hook when replaced", function() {
  var object = { condition: true, value: 'hello world', falsy: "Nothing" };
  var template = compile('<div>{{#if condition}}<p>{{value}}</p>{{else}}<p>{{falsy}}</p>{{/if}}</div>');

  var result = render(template, object);

  equalTokens(root, "<div><p>hello world</p></div>");

  object.condition = false;
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 1, "cleanup hook was invoked once");
  strictEqual(destroyedRenderNode.lastValue, 'hello world', "The correct render node is passed in");

  object.condition = true;
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 2, "cleanup hook was invoked again");
  strictEqual(destroyedRenderNode.lastValue, 'Nothing', "The correct render node is passed in");
});

QUnit.skip("MorphLists in childMorphs are properly cleared", function() {
  var object = {
    condition: true,
    falsy: "Nothing",
    list: [
      { key: "1", word: 'Hello' },
      { key: "2", word: 'World' }
    ]
  };
  var template = compile('<div>{{#if condition}}{{#each list as |item|}}<p>{{item.word}}</p>{{/each}}{{else}}<p>{{falsy}}</p>{{/if}}</div>');

  var result = render(template, object);

  equalTokens(root, "<div><p>Hello</p><p>World</p></div>");

  object.condition = false;
  result.rerender();

  equalTokens(root, "<div><p>Nothing</p></div>");

  strictEqual(destroyedRenderNodeCount, 5, "cleanup hook was invoked for each morph");

  object.condition = true;
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 6, "cleanup hook was invoked again");
});

QUnit.skip("Pruned render nodes invoke a cleanup hook when cleared", function() {
  var object = { condition: true, value: 'hello world' };
  var template = compile('<div>{{#if condition}}<p>{{value}}</p>{{/if}}</div>');

  var result = render(template, object);

  equalTokens(root, "<div><p>hello world</p></div>");

  object.condition = false;
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 1, "cleanup hook was invoked once");
  strictEqual(destroyedRenderNode.lastValue, 'hello world', "The correct render node is passed in");

  object.condition = true;
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 1, "cleanup hook was not invoked again");
});

QUnit.skip("Pruned lists invoke a cleanup hook when removing elements", function() {
  var object = { list: [{ key: "1", word: "hello" }, { key: "2", word: "world" }] };
  var template = compile('<div>{{#each list as |item|}}<p>{{item.word}}</p>{{/each}}</div>');

  var result = render(template, object);

  equalTokens(root, "<div><p>hello</p><p>world</p></div>");

  object.list.pop();
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 2, "cleanup hook was invoked once for the wrapper morph and once for the {{item.word}}");
  strictEqual(destroyedRenderNode.lastValue, "world", "The correct render node is passed in");

  object.list.pop();
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 4, "cleanup hook was invoked once for the wrapper morph and once for the {{item.word}}");
  strictEqual(destroyedRenderNode.lastValue, "hello", "The correct render node is passed in");
});

QUnit.skip("Pruned lists invoke a cleanup hook on their subtrees when removing elements", function() {
  var object = { list: [{ key: "1", word: "hello" }, { key: "2", word: "world" }] };
  var template = compile('<div>{{#each list as |item|}}<p>{{#if item.word}}{{item.word}}{{/if}}</p>{{/each}}</div>');

  var result = render(template, object);

  equalTokens(root, "<div><p>hello</p><p>world</p></div>");

  object.list.pop();
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 3, "cleanup hook was invoked once for the wrapper morph and once for the {{item.word}}");
  strictEqual(destroyedRenderNode.lastValue, "world", "The correct render node is passed in");

  object.list.pop();
  result.rerender();

  strictEqual(destroyedRenderNodeCount, 6, "cleanup hook was invoked once for the wrapper morph and once for the {{item.word}}");
  strictEqual(destroyedRenderNode.lastValue, "hello", "The correct render node is passed in");
});
