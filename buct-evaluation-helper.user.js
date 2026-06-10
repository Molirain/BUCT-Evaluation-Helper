// ==UserScript==
// @name         北化教评一键减负
// @namespace    https://github.com/Molirain
// @version      4.6.0
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
    const SPEED = 100;
    let isProcessing = false;

    // 保存原生的物理计时器（不受 SPEED 加速影响）
    const _setTimeout = window.setTimeout;
    window.setTimeout = function (fn, delay, ...args) {
        const newDelay = typeof delay === 'number' ? delay / SPEED : delay;
        return _setTimeout(fn, newDelay, ...args);
    };

    const _setInterval = window.setInterval;
    window.setInterval = function (fn, delay, ...args) {
        const newDelay = typeof delay === 'number' ? delay / SPEED : delay;
        return _setInterval(fn, newDelay, ...args);
    };

    console.log('[Tampermonkey] 全局计时器已加速：x' + SPEED);

    //############################ 配置 #################################

    let FILLTEXT = '非常满意！';
    let SCROLL = 2500;

    //########################## 配置结束 #################################

    const cleanStr = (str) => (str || '').replace(/\s+/g, '');

    function waitAndClick(finderFn, description) {
        return new Promise(resolve => {
            const check = () => {
                let el = finderFn();
                if (el && el.offsetParent !== null) {
                    console.log(`[Tampermonkey] 自动点击: ${description}`);
                    el.click();
                    resolve();
                } else {
                    _setTimeout(check, 150);
                }
            };
            _setTimeout(check, 150);
        });
    }

    function handlePostSubmitFlow() {
        return new Promise(resolve => {
            let clickedConfirm = false;

            let checkTimer = _setInterval(() => {
                let activeModals = Array.from(document.querySelectorAll('.ant-modal-wrap, .ant-modal, .ant-modal-content, .ant-confirm'))
                                        .filter(el => el.offsetParent !== null);

                if (activeModals.length === 0) return;

                let btns = [];
                activeModals.forEach(modal => {
                    btns.push(...Array.from(modal.querySelectorAll('.ant-btn')));
                });
                btns = btns.filter(el => el.offsetParent !== null);

                let nextBtn = btns.find(el => cleanStr(el.innerText).includes('下一'));
                let confirmBtn = btns.find(el => cleanStr(el.innerText).includes('确定'));
                let cancelBtn = btns.find(el => cleanStr(el.innerText).includes('取消'));

                if (nextBtn) {
                    console.log(`[Tampermonkey 雷达] 成功在弹窗内捕获进阶按钮 [${nextBtn.innerText.trim()}]`);
                    nextBtn.click();
                    window.clearInterval(checkTimer);
                    resolve();
                    return;
                }

                if (confirmBtn && cancelBtn && !clickedConfirm) {
                    console.log('[Tampermonkey 雷达] 成功在弹窗内捕获确认提交按钮，点击: 确定');
                    clickedConfirm = true;
                    confirmBtn.click();
                    _setTimeout(() => { clickedConfirm = false; }, 1000);
                    return;
                }

                let successText = activeModals.find(el => cleanStr(el.innerText).includes('提交成功'));
                if (successText && confirmBtn && !nextBtn && !cancelBtn && !clickedConfirm) {
                    console.log('[Tampermonkey 雷达] 检测到最终结算弹窗，点击确定收官');
                    clickedConfirm = true;
                    confirmBtn.click();
                    window.clearInterval(checkTimer);
                    resolve();
                    return;
                }
            }, 200);
        });
    }

    function selectAllRadios() {
        let questionGroups = document.querySelectorAll('.ant-radio-group, .ant-checkbox-group, [class*="question_Wrap"]');
        console.log(`[Tampermonkey 雷达] 本页共检测到 ${questionGroups.length} 道题目组`);

        questionGroups.forEach((group, index) => {
            let labels = Array.from(group.querySelectorAll('label'));
            if (labels.length === 0) return;

            let targetLabel = (index === 0) ? labels[0] : labels[labels.length - 1];

            labels.forEach(lbl => {
                if (index !== 0 && (lbl.innerText.includes("适宜") || lbl.innerText.includes("非常满意") || lbl.innerText.includes("满意"))) {
                    if(!cleanStr(targetLabel.innerText).includes("满意")) {
                        targetLabel = lbl;
                    }
                }
            });

            if (targetLabel) {
                let input = targetLabel.querySelector('input[type="radio"], input[type="checkbox"]');
                if (input) {
                    let checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked').set;
                    if (checkedSetter) {
                        checkedSetter.call(input, true);
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
                targetLabel.click();
            }
        });
    }

    async function postHonkai() {
        isProcessing = true;

        selectAllRadios();
        _setTimeout(selectAllRadios, 150);

        let inputElements = document.querySelectorAll('.ant-input, textarea, input[type="text"]');
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

        _setTimeout(() => {
            let mainNode = document.querySelector('.ant-layout-content main');
            if(mainNode) mainNode.scrollBy({ top: SCROLL, behavior: 'smooth' });
        }, 400);

        await new Promise(resolve => _setTimeout(resolve, 600));

        console.log('[Tampermonkey] 数据层状态同步完毕。准备提交。');

        await waitAndClick(
            () => Array.from(document.querySelectorAll('.ant-btn')).find(el => cleanStr(el.innerText).includes('提交') || el.className.includes('index__submit')),
            '页面提交按钮'
        );

        await handlePostSubmitFlow();

        _setTimeout(() => {
            isProcessing = false;
        }, 1500);
    }


    function toggleAuto() {
        let isAuto = sessionStorage.getItem('snow_auto_ping') === 'true';
        if (isAuto) {
            sessionStorage.setItem('snow_auto_ping', 'false');
            console.log('[Tampermonkey] 已停止全自动挂机');
        } else {
            sessionStorage.setItem('snow_auto_ping', 'true');
            console.log('[Tampermonkey] 已开启全自动挂机！');
        }
        updateBtnState();
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
            let hasQuestionnaire = document.querySelectorAll('.ant-radio-group, .ant-checkbox-group, [class*="question"]').length > 0;
            if (hasQuestionnaire) {
                isProcessing = true;
                console.log('[Tampermonkey] 检测到问卷表单，挂机启动...');

                _setTimeout(() => {
                    postHonkai().catch(e => {
                        console.error(e);
                        isProcessing = false;
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