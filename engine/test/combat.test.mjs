import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateFormula,applyRecipe} from '../server/combat.mjs';

test('all existing MV damage formulas parse without executing JavaScript',async()=>{
  const values={hp:100,mp:50,mhp:100,mmp:50,atk:30,def:10,mat:20,mdf:10,agi:10,luk:10,level:1};
  for(const name of ['Items','Skills'])for(const item of JSON.parse(await readFile(new URL(`../../data/${name}.json`,import.meta.url),'utf8'))){if(item?.damage)assert.ok(Number.isFinite(evaluateFormula(item.damage.formula,values,values)));}
  assert.throws(()=>evaluateFormula('process.exit()',values,values));
  assert.throws(()=>evaluateFormula('1/0',values,values));
  assert.equal(evaluateFormula('(a.atk*4-b.def*2)*0.9',values,values),90);
});
test('craft validates all ingredients before committing any consumption',()=>{
  const state={gold:10,inventory:[{kind:'item',itemId:1,quantity:2}]};
  const before=structuredClone(state),recipe={ingredients:[{kind:'item',itemId:1,amount:2},{kind:'gold',amount:20}],result:{kind:'item',itemId:2,amount:1}};
  assert.throws(()=>applyRecipe(state,recipe,{Items:[null,{},{}]}));assert.deepEqual(state,before);
  recipe.ingredients[1].amount=5;applyRecipe(state,recipe,{Items:[null,{},{}]});
  assert.deepEqual(state,{gold:5,inventory:[{kind:'item',itemId:2,quantity:1}]});
});
