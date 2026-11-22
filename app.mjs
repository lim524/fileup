import { makeZip } from './zip.mjs';

const byId = id => document.getElementById(id);
const [drop, pick, input, sort, keep, clear, count, empty, table, rows, status, download] =
  ['drop', 'pick', 'files', 'sort', 'keep', 'clear', 'count', 'empty', 'table', 'rows', 'status', 'download'].map(byId);

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'medium' });
let selected = [];
let busy = false;

function namedFiles() {
  const direction = sort.value === 'asc' ? 1 : -1;
  return [...selected]
    .sort((a, b) => (a.file.lastModified - b.file.lastModified) * direction)
    .map((entry, index) => {
      const original = entry.file.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
      const dot = original.lastIndexOf('.');
      const suffix = keep.checked ? '_' + original : dot > 0 ? original.slice(dot) : '';
      return { ...entry, name: (index + 1) + suffix };
    });
}

function updateControls() {
  for (const control of [pick, sort, keep, ...rows.querySelectorAll('button')]) control.disabled = busy;
  clear.disabled = download.disabled = busy || selected.length === 0;
}

function render() {
  count.textContent = '파일 ' + selected.length.toLocaleString('ko-KR') + '개';
  empty.hidden = selected.length > 0;
  table.hidden = selected.length === 0;
  rows.replaceChildren();
  for (const entry of namedFiles()) {
    const row = rows.insertRow();
    for (const value of [entry.file.name, dateFormat.format(entry.file.lastModified), entry.name]) {
      row.insertCell().textContent = value;
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'quiet';
    remove.textContent = '제거';
    remove.setAttribute('aria-label', entry.file.name + ' 제거');
    remove.addEventListener('click', () => {
      selected = selected.filter(item => item.id !== entry.id);
      refresh();
    });
    row.insertCell().append(remove);
  }
  updateControls();
}

function refresh() {
  status.textContent = '';
  render();
}

function add(files) {
  if (busy || !files.length) return;
  for (const file of files) selected.push({ id: Symbol(), file });
  refresh();
}

pick.addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  add(input.files);
  input.value = '';
});
window.addEventListener('dragover', event => {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault();
});
window.addEventListener('drop', event => {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault();
});
drop.addEventListener('dragover', event => {
  if (!busy && event.dataTransfer.types.includes('Files')) drop.classList.add('active');
});
drop.addEventListener('dragleave', event => {
  if (!drop.contains(event.relatedTarget)) drop.classList.remove('active');
});
drop.addEventListener('drop', event => {
  drop.classList.remove('active');
  add(event.dataTransfer.files);
});
sort.addEventListener('change', refresh);
keep.addEventListener('change', refresh);
clear.addEventListener('click', () => {
  selected = [];
  refresh();
  pick.focus();
});

download.addEventListener('click', async () => {
  if (busy || !selected.length) return;
  busy = true;
  updateControls();
  status.textContent = 'ZIP을 만드는 중…';
  try {
    const zip = await makeZip(namedFiles(), (done, total) => {
      status.textContent = 'ZIP 생성 중 ' + done + ' / ' + total;
    });
    const url = URL.createObjectURL(zip);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ordered-files.zip';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = 'ZIP 다운로드를 시작했어요.';
  } catch (error) {
    status.textContent = error instanceof Error && error.message.startsWith('ZIP 한 건')
      ? error.message : 'ZIP 생성에 실패했어요. 파일을 다시 선택해 주세요.';
  } finally {
    busy = false;
    updateControls();
  }
});
