// デプロイ後、SAM の Outputs に表示される ApiEndpoint の値に置き換えてください。
// 例: https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/Prod/apply
const API_ENDPOINT = 'https://REPLACE_ME.execute-api.ap-northeast-1.amazonaws.com/Prod/apply';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const form = document.getElementById('apply-form');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const agreeInput = document.getElementById('agree');

const stepper = document.getElementById('stepper');
const stepInput = document.getElementById('step-input');
const stepConfirm = document.getElementById('step-confirm');
const stepComplete = document.getElementById('step-complete');

const btnBack = document.getElementById('btn-back');
const btnSubmit = document.getElementById('btn-submit');
const btnSubmitLabel = document.getElementById('btn-submit-label');
const submitError = document.getElementById('submit-error');

function setStep(stepNumber) {
    [stepInput, stepConfirm, stepComplete].forEach((section, index) => {
        section.classList.toggle('is-hidden', index + 1 !== stepNumber);
    });

    stepper.querySelectorAll('.stepper__item').forEach((item) => {
        const n = Number(item.dataset.step);
        item.classList.toggle('is-active', n === stepNumber);
        item.classList.toggle('is-done', n < stepNumber);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showFieldError(inputEl, errorEl, message) {
    inputEl.classList.toggle('is-invalid', Boolean(message));
    errorEl.textContent = message || '';
}

function validateForm() {
    let isValid = true;

    const name = nameInput.value.trim();
    if (!name) {
        showFieldError(nameInput, document.getElementById('name-error'), 'お名前を入力してください。');
        isValid = false;
    } else if (name.length > 50) {
        showFieldError(nameInput, document.getElementById('name-error'), 'お名前は50文字以内で入力してください。');
        isValid = false;
    } else {
        showFieldError(nameInput, document.getElementById('name-error'), '');
    }

    const email = emailInput.value.trim();
    if (!email) {
        showFieldError(emailInput, document.getElementById('email-error'), 'メールアドレスを入力してください。');
        isValid = false;
    } else if (!EMAIL_REGEX.test(email)) {
        showFieldError(emailInput, document.getElementById('email-error'), 'メールアドレスの形式が正しくありません。');
        isValid = false;
    } else {
        showFieldError(emailInput, document.getElementById('email-error'), '');
    }

    const agreeError = document.getElementById('agree-error');
    if (!agreeInput.checked) {
        agreeError.textContent = '利用規約への同意が必要です。';
        isValid = false;
    } else {
        agreeError.textContent = '';
    }

    return isValid;
}

form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!validateForm()) {
        return;
    }

    document.getElementById('confirm-name').textContent = nameInput.value.trim();
    document.getElementById('confirm-email').textContent = emailInput.value.trim();
    submitError.textContent = '';

    setStep(2);
});

btnBack.addEventListener('click', () => {
    setStep(1);
});

btnSubmit.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    btnSubmit.disabled = true;
    btnSubmitLabel.textContent = '送信中...';
    submitError.textContent = '';

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'お申し込みの送信に失敗しました。時間を置いて再度お試しください。');
        }

        if (data.message) {
            document.getElementById('complete-message').textContent = data.message;
        }

        setStep(3);
    } catch (error) {
        submitError.textContent = error.message || '通信エラーが発生しました。時間を置いて再度お試しください。';
    } finally {
        btnSubmit.disabled = false;
        btnSubmitLabel.textContent = 'この内容で申し込む';
    }
});
