// ==UserScript==
// @name         北化教评一键减负
// @namespace    https://github.com/Molirain
// @version      4.7.0
// @description  北京化工大学（BUCT）教评系统一键全自动挂机减负脚本，解放双手，智能识别弹窗与特殊课程模板。
// @author       Molirain
// @match        https://buct.mycospxk.com/index.html*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=https://buct.mycospxk.com
// @supportURL   https://github.com/Molirain/BUCT-Evaluation-Helper/issues
// @updateURL    https://raw.githubusercontent.com/Molirain/BUCT-Evaluation-Helper/main/buct-evaluation-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/Molirain/BUCT-Evaluation-Helper/main/buct-evaluation-helper.user.js
// @license      MIT
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    let isProcessing = false;
    let lastCompletedForm = '';
    const _setTimeout = window.setTimeout.bind(window);
    const _setInterval = window.setInterval.bind(window);
    const _clearInterval = window.clearInterval.bind(window);

    //############################ 配置 #################################

    let FILLTEXT = '非常满意！';
    let SCROLL = 2500;
    const POLL_INTERVAL = 250;
    const CLICK_TIMEOUT = 20000;
    const SUBMIT_TIMEOUT = 30000;

    //########################## 配置结束 #################################

    const cleanStr = (str) => (str || '').replace(/\s+/g, '');

    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    }

    function getOptionLabels(group) {
        return Array.from(group.querySelectorAll('label')).filter(label =>
            label.querySelector('input[type="radio"], input[type="checkbox"]') ||
            label.matches('.ant-radio-wrapper, .ant-checkbox-wrapper, [role="radio"], [role="checkbox"]')
        );
    }

    function getQuestionGroups() {
        const selectors = [
            '.ant-radio-group', '.ant-checkbox-group', '[role="radiogroup"]',
            '[class*="question_Wrap"]', '[class*="question-wrap"]', '[class*="questionItem"]'
        ];
        const groups = [];
        const seenInputs = new Set();

        document.querySelectorAll(selectors.join(',')).forEach(group => {
            if (!isVisible(group)) return;
            const labels = getOptionLabels(group);
            const freshLabels = labels.filter(label => {
                const input = label.querySelector('input[type="radio"], input[type="checkbox"]');
                return !input || !seenInputs.has(input);
            });
            if (freshLabels.length === 0) return;
            freshLabels.forEach(label => {
                const input = label.querySelector('input[type="radio"], input[type="checkbox"]');
                if (input) seenInputs.add(input);
            });
            groups.push({ element: group, labels: freshLabels });
        });

        // Fallback for updated layouts that keep the inputs but change their wrapper classes.
        if (groups.length === 0) {
            const byName = new Map();
            document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
                if (!isVisible(input)) return;
                const label = input.closest('label');
                if (!label) return;
                const key = input.name || input.closest('[class*="question"], .ant-form-item, [role="group"]') || label.parentElement;
                if (!byName.has(key)) byName.set(key, []);
                byName.get(key).push(label);
            });
            byName.forEach(labels => {
                if (labels.length > 0) groups.push({ element: labels[0].parentElement, labels });
            });
        }
        return groups;
    }

    function getFormSignature() {
        const groups = getQuestionGroups();
        const main = document.querySelector('main, [role="main"], .ant-layout-content') || document.body;
        const heading = main.querySelector('h1, h2, h3, [class*="courseName"], [class*="teacherName"]');
        const content = main.cloneNode(true);
        content.querySelectorAll('button, .ant-btn, [role="button"], .ant-modal, [role="dialog"], [contenteditable="true"]').forEach(el => el.remove());
        return [location.href, cleanStr(heading?.innerText || ''),
            groups.map(({ element, labels }) => cleanStr(element.innerText || labels.map(label => label.innerText).join(' '))).join('|'),
            cleanStr(content.textContent).slice(0, 5000)
        ].join('::');
    }

    function setAutoMode(enabled) {
        sessionStorage.setItem('snow_auto_ping', enabled ? 'true' : 'false');
        updateBtnState();
    }

    function waitAndClick(finderFn, description) {
        return new Promise((resolve, reject) => {
            const startedAt = Date.now();
            const check = () => {
                let el = finderFn();
                if (isVisible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
                    console.log(`[Tampermonkey] 自动点击: ${description}`);
                    el.click();
                    resolve();
                } else if (Date.now() - startedAt >= CLICK_TIMEOUT) {
                    reject(new Error(`等待${description}超时，请检查页面是否已更新`));
                } else {
                    _setTimeout(check, POLL_INTERVAL);
                }
            };
            _setTimeout(check, POLL_INTERVAL);
        });
    }

    function handlePostSubmitFlow(startSignature) {
        return new Promise((resolve, reject) => {
            const startedAt = Date.now();
            const startUrl = location.href;
            let sawModal = false;
            let clickedConfirm = false;

            const checkTimer = _setInterval(() => {
                const activeModals = Array.from(document.querySelectorAll(
                    '.ant-modal-wrap, .ant-modal, .ant-confirm, [role="dialog"]'
                )).filter(isVisible);

                if (activeModals.length > 0) sawModal = true;
                if (sawModal && activeModals.length === 0) {
                    _clearInterval(checkTimer);
                    resolve();
                    return;
                }
                if (!sawModal && (location.href !== startUrl || getQuestionGroups().length === 0 ||
                    getFormSignature() !== startSignature)) {
                    _clearInterval(checkTimer);
                    resolve();
                    return;
                }
                if (Date.now() - startedAt >= SUBMIT_TIMEOUT) {
                    _clearInterval(checkTimer);
                    reject(new Error('提交后长时间没有收到页面确认，请检查提交状态后再继续'));
                    return;
                }
                if (activeModals.length === 0) return;

                const buttons = Array.from(new Set(activeModals.flatMap(modal =>
                    Array.from(modal.querySelectorAll('button, .ant-btn, [role="button"]'))
                ))).filter(isVisible);
                const nextBtn = buttons.find(el => /(下一|继续|下一项|下一门|下一位)/.test(cleanStr(el.innerText)));
                const confirmBtn = buttons.find(el => /(确定|确认|知道了|完成|关闭)/.test(cleanStr(el.innerText)));
                const submitConfirmBtn = buttons.find(el => /^(确定|确认|提交)$/.test(cleanStr(el.innerText)));
                const cancelBtn = buttons.find(el => cleanStr(el.innerText).includes('取消'));
                const successText = activeModals.some(el => cleanStr(el.innerText).includes('提交成功'));

                if (nextBtn && !nextBtn.disabled) {
                    console.log(`[Tampermonkey] 已确认页面进阶: ${nextBtn.innerText.trim()}`);
                    nextBtn.click();
                    _clearInterval(checkTimer);
                    resolve();
                    return;
                }
                if (submitConfirmBtn && cancelBtn && !clickedConfirm && !submitConfirmBtn.disabled) {
                    console.log('[Tampermonkey] 确认提交');
                    clickedConfirm = true;
                    submitConfirmBtn.click();
                    return;
                }
                if (successText && confirmBtn && !cancelBtn && !clickedConfirm && !confirmBtn.disabled) {
                    console.log('[Tampermonkey] 已检测到提交成功提示');
                if (confirmBtn && !cancelBtn && !clickedConfirm && !confirmBtn.disabled) {
                    console.log('[Tampermonkey] 提交后确认: ' + cleanStr(confirmBtn.innerText));
                    clickedConfirm = true;
                    confirmBtn.click();
                }
            }, POLL_INTERVAL);
        });
    }

    function selectAllRadios() {
        const questionGroups = getQuestionGroups();
        console.log(`[Tampermonkey] 本页识别到 ${questionGroups.length} 道选择题`);

        questionGroups.forEach(({ labels }, index) => {
            const positiveLabel = labels.find(label =>
                /(非常|很|十分|完全|优秀|excellent|strongly)/i.test(label.innerText) &&
                !/(不满意|不适宜|不太|不够)/.test(label.innerText)
            );
            const targetLabel = index === 0 ? labels[0] : (positiveLabel || labels[labels.length - 1]);
            if (targetLabel) {
                targetLabel.click();
            }
        });
    }

    async function postHonkai() {
        isProcessing = true;
        const startSignature = getFormSignature();

        selectAllRadios();
        _setTimeout(selectAllRadios, 300);

        const inputElements = Array.from(document.querySelectorAll('textarea, input[type="text"], .ant-input'))
            .filter(item => {
                if (!isVisible(item) || item.disabled || item.readOnly) return false;
                if (item.matches('input') && /search|password|email|number/.test(item.type)) return false;
                return item.tagName === 'TEXTAREA' || Boolean(item.closest('[class*="question"], .ant-form-item, [role="group"]'));
            });
        inputElements.forEach(item => {
            let targetPrototype = (item instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            let descriptor = Object.getOwnPropertyDescriptor(targetPrototype, 'value');
            let valueSetter = descriptor ? descriptor.set : null;

            if (valueSetter) {
                valueSetter.call(item, FILLTEXT);
            } else {
                item.value = FILLTEXT;
            }
            item.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const richEditors = Array.from(document.querySelectorAll('[contenteditable="true"]'))
            .filter(editor => isVisible(editor) && !editor.closest('[role="toolbar"], .w-e-toolbar'));
        richEditors.forEach(editor => {
            editor.focus();
            editor.textContent = FILLTEXT;
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: FILLTEXT
            }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
        });
        if (richEditors.length > 0) {
            console.log(`[Tampermonkey] 已填写 ${richEditors.length} 个富文本意见框`);
        }

        _setTimeout(() => {
            const mainNode = document.querySelector('.ant-layout-content main, main, [role="main"]');
            if (mainNode) mainNode.scrollBy({ top: SCROLL, behavior: 'smooth' });
            else window.scrollBy({ top: SCROLL, behavior: 'smooth' });
        }, 400);

        await new Promise(resolve => _setTimeout(resolve, 800));

        console.log('[Tampermonkey] 数据层状态同步完毕。准备提交。');

        await waitAndClick(
            () => Array.from(document.querySelectorAll('button, .ant-btn, [role="button"]')).find(el =>
                (cleanStr(el.innerText) === '提交' || cleanStr(el.innerText).includes('提交评价') ||
                 (typeof el.className === 'string' && el.className.includes('index__submit')))
            ),
            '页面提交按钮'
        );

        await handlePostSubmitFlow(startSignature);
        lastCompletedForm = startSignature;

        _setTimeout(() => {
            isProcessing = false;
        }, 1500);
    }


    function toggleAuto() {
        let isAuto = sessionStorage.getItem('snow_auto_ping') === 'true';
        setAutoMode(!isAuto);
        console.log(`[Tampermonkey] 已${!isAuto ? '开启' : '停止'}全自动评教`);
    }

    function updateBtnState() {
        let btn = document.getElementById('snow-hi3-btn');
        if (!btn) return;
        let isAuto = sessionStorage.getItem('snow_auto_ping') === 'true';
        if (isAuto) {
            btn.innerText = '点击停止挂机';
            btn.style.backgroundColor = '#ff4d4f';
        } else {
            btn.innerText = '点击开启全自动';
            btn.style.backgroundColor = '#67b6ff';
        }
    }

    function checkAndRunAuto() {
        let isAuto = sessionStorage.getItem('snow_auto_ping') === 'true';
        if (isAuto && !isProcessing) {
            if (getQuestionGroups().length > 0) {
                const signature = getFormSignature();
                if (signature === lastCompletedForm) return;
                isProcessing = true;
                console.log('[Tampermonkey] 检测到评教表单，开始处理...');

                _setTimeout(() => {
                    postHonkai().catch(e => {
                        console.error(e);
                        isProcessing = false;
                        setAutoMode(false);
                        console.warn('[Tampermonkey] 自动流程已暂停，请检查页面后重新开启');
                    });
                }, 500);
            }
        }
    }

    function InsertCSS(css) {
        let styleSheet = document.createElement('style');
        styleSheet.innerHTML = css;
        document.head.appendChild(styleSheet);
    }

    InsertCSS(`
        #snow-hi3-btn {
            position: fixed;
            top: 80px;
            right: 30px;
            z-index: 99999;
            padding: 12px 24px;
            color: #fff;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: bold;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: all 0.3s;
        }
        #snow-hi3-btn:hover {
            box-shadow: 0 6px 12px rgba(0,0,0,0.3);
            transform: translateY(-2px);
        }
        #snow-hi3-btn:active {
            transform: translateY(0);
        }
    `);

    function tryCreateButton() {
        if (document.querySelector('#snow-hi3-btn')) return;

        let btn = document.createElement('button');
        btn.id = 'snow-hi3-btn';
        btn.addEventListener('click', toggleAuto);

        document.body.appendChild(btn);
        updateBtnState();
    }

    setInterval(() => {
        if (document.querySelector('#snow-hi3-btn') == null) {
            tryCreateButton();
        }
        checkAndRunAuto();
    }, 500);

})();
