import{M as l,r as u,ac as p,an as d,ao as f,aZ as m,j as e}from"./index-Dv9D8_TG.js";import{t as _}from"./UseForm-xLA0hDZb.js";import{I as v}from"./IconAt-NbCkpqA4.js";import{at as h,$ as k,w as x,au as M}from"./moduleFlags-C205GnXt.js";/**
 * @license @tabler/icons-react v3.34.1 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["path",{d:"M7 9a4 4 0 1 0 8 0a4 4 0 0 0 -8 0",key:"svg-0"}],["path",{d:"M5.75 15a8.015 8.015 0 1 0 9.25 -13",key:"svg-1"}],["path",{d:"M11 17v4",key:"svg-2"}],["path",{d:"M7 21h8",key:"svg-3"}]],j=l("outline","globe","Globe",y);/**
 * @license @tabler/icons-react v3.34.1 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=[["path",{d:"M13 20l7 -7",key:"svg-0"}],["path",{d:"M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7",key:"svg-1"}]],b=l("outline","note","Note",g);function w({supplierId:t,manufacturerId:s,manufacturerPartId:n,partId:r,useStockSelection:i=!1}){return u.useMemo(()=>{const o={part:{value:r,disabled:!!r,hidden:i,filters:{part:r,purchaseable:!0,active:!0}},manufacturer_part:{value:n,filters:{manufacturer:s,part_detail:!0,manufacturer_detail:!0},adjustFilters:a=>({...a.filters,part:a.data.part})},stock_item:{field_type:"related field",hidden:!i,model:m.stockitem,api_url:d(f.stock_item_list),filters:{part_detail:!0,supplier_part:"null",in_stock:!0},description:p._({id:"EG4wFf"}),modelRenderer:({instance:a})=>e.jsx(_,{instance:a,link:!1}),onValueChange:(a,c)=>{o.part.value=c?.part??c?.part_detail?.pk??void 0}},supplier:{value:t,hidden:!!t,disabled:!!t,filters:{active:!0,is_supplier:!0}},SKU:{icon:e.jsx(M,{})},description:{},link:{icon:e.jsx(x,{})},note:{icon:e.jsx(b,{})},active:{}};return o},[t,s,n,r,i])}function C(){return u.useMemo(()=>({part:{},manufacturer:{filters:{active:!0,is_manufacturer:!0}},MPN:{},description:{},link:{}}),[])}function G(){return{name:{},description:{},website:{icon:e.jsx(j,{})},currency:{icon:e.jsx(k,{})},phone:{icon:e.jsx(h,{})},email:{icon:e.jsx(v,{})},tax_id:{},is_supplier:{},is_manufacturer:{},is_customer:{},active:{}}}export{w as a,G as c,C as u};
//# sourceMappingURL=CompanyForms-O7eWZb2t.js.map
