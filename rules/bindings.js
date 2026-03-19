/**
 * Figma Variable Binding Validator
 *
 * Figma Plugin Console (figma_execute)에서 실행하는 검증 스크립트.
 * 하나라도 실패하면 통과시키지 않음.
 *
 * 검증 항목 (16개):
 *  [Color]
 *   1. UNBOUND_FILL        - 배경색 변수 미바인딩
 *   2. UNBOUND_STROKE       - 테두리색 변수 미바인딩
 *   3. UNBOUND_TEXT_FILL    - 텍스트색 변수 미바인딩
 *   4. LOW_CONTRAST         - 텍스트-배경 대비 2.5:1 미만
 *  [Layout]
 *   5. UNBOUND_PADDING      - 패딩 변수 미바인딩
 *   6. UNBOUND_RADIUS       - 라운드 변수 미바인딩
 *   7. UNBOUND_GAP          - 간격(itemSpacing) 변수 미바인딩
 *   8. UNBOUND_STROKE_WEIGHT - 테두리 두께 변수 미바인딩
 *  [Typography]
 *   9. UNBOUND_FONT_SIZE    - 폰트 크기 변수 미바인딩
 *  10. UNBOUND_FONT_WEIGHT  - 폰트 굵기 변수 미바인딩
 *  11. UNBOUND_FONT_FAMILY  - 폰트 패밀리 변수 미바인딩
 *  12. UNBOUND_LINE_HEIGHT  - 행간 변수 미바인딩
 *  [Component Structure]
 *  13. FRAME_NOT_INSTANCE   - 컴포넌트여야 할 FRAME (예: button, icon)
 *  14. TEXT_STYLE_CONFLICT  - Text Style과 변수 바인딩 충돌
 *  15. REMOTE_HAS_LOCAL     - remote 인스턴스에 동일 이름의 로컬 컴포넌트가 존재
 *  16. VARIANT_STRUCTURE_MISMATCH - 같은 ComponentSet 내 variant 간 자식 구조 불일치
 *
 * 사용법: figma_execute에 이 스크립트 전체를 붙여넣기
 */

// ─── 검증 대상: Components 페이지의 모든 컴포넌트 자동 탐색 ───
await figma.loadAllPagesAsync();
const componentsPage = figma.root.children.find(p => p.name === 'Components');
if (!componentsPage) return { '====': '❌ FAILED', error: 'Components 페이지를 찾을 수 없습니다' };

const targets = [];
function collectComponents(node) {
  if (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') {
    // COMPONENT_SET의 자식 COMPONENT는 제외 (SET 단위로 검증)
    if (node.parent && node.parent.type === 'COMPONENT_SET') return;
    targets.push(node);
  }
  if ('children' in node && node.type !== 'COMPONENT_SET' && node.type !== 'COMPONENT') {
    for (const child of node.children) collectComponents(child);
  }
}
for (const child of componentsPage.children) collectComponents(child);

// FRAME인데 INSTANCE여야 하는 이름 패턴
const SHOULD_BE_INSTANCE = ['button', 'icon', 'checkbox', 'radio', 'toggle', 'spinner', 'avatar'];

// ─── 로컬 ComponentSet 이름 수집 (REMOTE_HAS_LOCAL용) ───
const localSetNames = new Set();
function collectLocalSets(node) {
  if (node.type === 'COMPONENT_SET') {
    localSetNames.add(node.name.toLowerCase());
    return;
  }
  if ('children' in node && node.type !== 'INSTANCE') {
    for (const child of node.children) collectLocalSets(child);
  }
}
for (const page of figma.root.children) collectLocalSets(page);

// ─── 유틸 ───
async function resolveColor(paint) {
  if (!paint || !paint.boundVariables || !paint.boundVariables.color) return null;
  let varId = paint.boundVariables.color.id;
  let depth = 0;
  while (depth < 10) {
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (!v) return null;
    const val = Object.values(v.valuesByMode)[0];
    if (val.type === 'VARIABLE_ALIAS') { varId = val.id; depth++; }
    else { return { r: val.r, g: val.g, b: val.b, a: val.a !== undefined ? val.a : 1 }; }
  }
  return null;
}

function luminance(c) {
  const f = v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ─── 검증 로직 ───
const allIssues = [];

async function validate(node, parentBg, depth, comp) {
  if (depth > 6) return;
  let bgColor = parentBg;
  const bv = node.boundVariables || {};

  // ── [13] FRAME_NOT_INSTANCE ──
  if (node.type === 'FRAME' && depth > 0) {
    const nameLower = node.name.toLowerCase();
    for (const pattern of SHOULD_BE_INSTANCE) {
      if (nameLower === pattern) {
        allIssues.push({ comp, node: node.name, id: node.id, issue: 'FRAME_NOT_INSTANCE' });
        break;
      }
    }
  }

  // ── [Color] ──
  if (node.type !== 'TEXT' && node.fills && Array.isArray(node.fills) && node.fills.length > 0 && node.fills[0].visible !== false) {
    const f = node.fills[0];
    if (f.type === 'SOLID' && (f.opacity === undefined || f.opacity > 0)) {
      if (!(f.boundVariables && f.boundVariables.color))
        allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_FILL' });
    }
    const resolved = await resolveColor(f);
    if (resolved) bgColor = resolved;
  }

  if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0 && node.strokes[0].visible !== false) {
    if (node.strokes[0].type === 'SOLID' && !(node.strokes[0].boundVariables && node.strokes[0].boundVariables.color))
      allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_STROKE' });
  }

  if (node.type === 'TEXT' && node.fills && node.fills.length > 0 && node.fills[0].visible !== false && node.fills[0].type === 'SOLID') {
    if (!(node.fills[0].boundVariables && node.fills[0].boundVariables.color))
      allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_TEXT_FILL' });
    const tc = await resolveColor(node.fills[0]);
    if (tc && bgColor && contrastRatio(tc, bgColor) < 2.5)
      allIssues.push({ comp, node: node.name, id: node.id, issue: 'LOW_CONTRAST', ratio: contrastRatio(tc, bgColor).toFixed(2) });
  }

  // ── [Layout] ──
  if (node.paddingLeft !== undefined && node.paddingLeft > 0 && !bv.paddingLeft)
    allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_PADDING' });
  if (node.topLeftRadius !== undefined && node.topLeftRadius > 0 && !bv.topLeftRadius)
    allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_RADIUS' });
  if (node.itemSpacing !== undefined && node.itemSpacing > 0 && !bv.itemSpacing)
    allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_GAP' });
  if (node.strokes && node.strokes.length > 0 && node.strokes[0].visible !== false) {
    if (node.strokeWeight > 0 && !bv.strokeTopWeight && !bv.strokeWeight)
      allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_STROKE_WEIGHT' });
  }

  // ── [Typography] ──
  if (node.type === 'TEXT') {
    if (!bv.fontSize) allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_FONT_SIZE' });
    if (!bv.fontWeight) allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_FONT_WEIGHT' });
    if (!bv.fontFamily) allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_FONT_FAMILY' });
    if (!bv.lineHeight) allIssues.push({ comp, node: node.name, id: node.id, issue: 'UNBOUND_LINE_HEIGHT' });

    // ── [14] TEXT_STYLE_CONFLICT ──
    try {
      if (node.textStyleId && node.textStyleId !== '' && node.textStyleId !== figma.mixed) {
        allIssues.push({ comp, node: node.name, id: node.id, issue: 'TEXT_STYLE_CONFLICT' });
      }
    } catch (e) {}
  }

  // ── [15] REMOTE_HAS_LOCAL ──
  if (node.type === 'INSTANCE') {
    try {
      const main = await node.getMainComponentAsync();
      if (main && main.remote) {
        const parent = main.parent;
        const setName = parent && parent.type === 'COMPONENT_SET' ? parent.name.toLowerCase() : null;
        if (setName && localSetNames.has(setName)) {
          allIssues.push({ comp, node: node.name, id: node.id, issue: 'REMOTE_HAS_LOCAL', remoteSet: parent.name });
        }
      }
    } catch (e) {}
  }

  // ── Recurse (INSTANCE 내부는 스킵) ──
  if ('children' in node && node.type !== 'INSTANCE') {
    for (const child of node.children) {
      await validate(child, bgColor, depth + 1, comp);
    }
  }
}

// ─── 실행 ───
for (const node of targets) {
  if (node.type === 'COMPONENT_SET') {
    for (const v of node.children) {
      await validate(v, { r: 1, g: 1, b: 1, a: 1 }, 0, node.name);
    }
  } else {
    await validate(node, { r: 1, g: 1, b: 1, a: 1 }, 0, node.name);
  }
}

// ─── [16] VARIANT_STRUCTURE_MISMATCH ───
// ComponentSet 내 variant들의 동일 이름 프레임이 다른 자식 구조를 가지면 감지
for (const node of targets) {
  if (node.type !== 'COMPONENT_SET') continue;

  // 각 variant에서 프레임별 구조 시그니처 수집
  function getSignatures(n, depth) {
    if (depth > 4 || !('children' in n)) return {};
    const sigs = {};
    for (const child of n.children) {
      if (child.type === 'FRAME' || child.type === 'GROUP') {
        const childTypes = 'children' in child
          ? child.children.map(gc => gc.type + ':' + gc.name).join(',')
          : '';
        const sig = {
          childCount: 'children' in child ? child.children.length : 0,
          childTypes,
          gap: child.itemSpacing,
        };
        sigs[child.name] = sig;
        // 재귀로 하위 프레임도 수집
        const sub = getSignatures(child, depth + 1);
        for (const [k, v] of Object.entries(sub)) {
          sigs[child.name + '/' + k] = v;
        }
      }
    }
    return sigs;
  }

  // 모든 variant의 시그니처를 모음
  const allSigs = [];
  for (const variant of node.children) {
    allSigs.push({ variant: variant.name, id: variant.id, sigs: getSignatures(variant, 0) });
  }

  // 동일 이름 프레임 간 비교
  const frameNames = new Set();
  for (const { sigs } of allSigs) {
    for (const k of Object.keys(sigs)) frameNames.add(k);
  }

  for (const frameName of frameNames) {
    // 이 프레임을 가진 variant들만 추출
    const withFrame = allSigs.filter(s => s.sigs[frameName]);
    if (withFrame.length < 2) continue;

    // 시그니처 문자열로 비교
    const sigStrs = withFrame.map(s => {
      const sig = s.sigs[frameName];
      return `${sig.childCount}|${sig.childTypes}|${sig.gap}`;
    });

    const unique = [...new Set(sigStrs)];
    if (unique.length > 1) {
      // 가장 흔한 패턴 vs 이탈 variant 찾기
      const counts = {};
      sigStrs.forEach((s, i) => {
        if (!counts[s]) counts[s] = [];
        counts[s].push(i);
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1].length - a[1].length);
      const majorPattern = sorted[0][0];
      // 이탈 variant만 리포트
      for (const [pattern, indices] of sorted) {
        if (pattern === majorPattern) continue;
        for (const idx of indices) {
          allIssues.push({
            comp: node.name,
            node: frameName,
            id: withFrame[idx].id,
            issue: 'VARIANT_STRUCTURE_MISMATCH',
            variant: withFrame[idx].variant,
            expected: majorPattern,
            actual: pattern,
          });
        }
      }
    }
  }
}

// ─── 결과 집계 ───
const summary = {};
for (const i of allIssues) {
  if (!summary[i.comp]) summary[i.comp] = {};
  summary[i.comp][i.issue] = (summary[i.comp][i.issue] || 0) + 1;
}

const PASSED = allIssues.length === 0;

return {
  '====': PASSED ? '✅ ALL PASSED' : '❌ FAILED',
  componentsChecked: targets.map(t => `${t.name} (${t.type}, ${t.id})`),
  totalComponents: targets.length,
  totalIssues: allIssues.length,
  summary,
  issues: allIssues.slice(0, 30),
};
