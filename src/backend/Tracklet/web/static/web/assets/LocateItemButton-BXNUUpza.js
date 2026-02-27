import{V as p,r as l,i as r,ao as d,ap as g,j as a}from"./index-BwcFHVoW.js";import{A as f}from"./ActionButton-Cetdf-XM.js";import{c as h}from"./Filter-BZnR_2e2.js";import{u as v}from"./UsePlugins-B73d7tFH.js";/**
 * @license @tabler/icons-react v3.34.1 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=[["path",{d:"M21 12h-8a1 1 0 1 0 -1 1v8a9 9 0 0 0 9 -9",key:"svg-0"}],["path",{d:"M16 9a5 5 0 1 0 -7 7",key:"svg-1"}],["path",{d:"M20.486 9a9 9 0 1 0 -11.482 11.495",key:"svg-2"}]],_=p("outline","radar","Radar",x);function k({stockId:i,locationId:o}){const e=v("locate"),[n,s]=l.useState(void 0);l.useEffect(()=>{n&&e?e.find(m=>m.key===n)||s(void 0):s(e[0]?.key??void 0)},[n,e]);const c=l.useMemo(()=>({plugin:{field_type:"choice",value:n,onValueChange:t=>{s(t)},choices:e.map(t=>({value:t.key,display_name:t.meta?.human_name??t.name}))},item:{hidden:!0,value:i},location:{hidden:!0,value:o}}),[i,o,e]),u=h({url:d(g.plugin_locate_item),method:"POST",title:r._({id:"px+tn2"}),fields:c,successMessage:r._({id:"AXn3rz"})});return!e||e.length===0||!i&&!o?null:a.jsxs(a.Fragment,{children:[u.modal,a.jsx(f,{icon:a.jsx(_,{}),variant:"outline",size:"lg",tooltip:r._({id:"px+tn2"}),onClick:u.open,tooltipAlignment:"bottom"})]})}export{k as L};
//# sourceMappingURL=LocateItemButton-BXNUUpza.js.map
