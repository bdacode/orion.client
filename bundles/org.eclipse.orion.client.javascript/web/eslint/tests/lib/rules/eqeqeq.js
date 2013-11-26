/*******************************************************************************
 * @license
 * Copyright (c) 2013 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*global describe it module require*/

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var assert = require("assert"),
	mocha = require("mocha"),
	eslint = require("../../../lib/eslint");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

var RULE_ID = "eqeqeq";

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------
describe(RULE_ID, function() {
	it("should flag ==", function() {
		var topic = "if (a == b) {}";

		var config = { rules: {} };
		config.rules[RULE_ID] = 1;

		var messages = eslint.verify(topic, config);
		assert.equal(messages.length, 1);
		assert.equal(messages[0].ruleId, RULE_ID);
		assert.equal(messages[0].message, "Expected '===' and instead saw '=='.");
		assert.equal(messages[0].node.type, "BinaryExpression");
	});
	it("should flag !=", function() {
		var topic = "if (a != b) {}";

		var config = { rules: {} };
		config.rules[RULE_ID] = 1;

		var messages = eslint.verify(topic, config);
		assert.equal(messages.length, 1);
		assert.equal(messages[0].ruleId, RULE_ID);
		assert.equal(messages[0].message, "Expected '!==' and instead saw '!='.");
		assert.equal(messages[0].node.type, "BinaryExpression");
	});
	it("should not flag ===", function() {
		var topic = "if (a === b) {}";

		var config = { rules: {} };
		config.rules[RULE_ID] = 1;

		var messages = eslint.verify(topic, config);
		assert.equal(messages.length, 0);
	});
	it("should not flag !==", function() {
		var topic = "if (a !== b) {}";

		var config = { rules: {} };
		config.rules[RULE_ID] = 1;

		var messages = eslint.verify(topic, config);
		assert.equal(messages.length, 0);
	});
});
