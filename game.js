// 1. መሰረታዊ መረጃዎች
const STAKES = [5, 10, 20, 50, 100];
let currentUser = null;

// 2. ሩሞችን በስክሪኑ ላይ የመሳል ስራ
function renderStakeRooms() {
    const listContainer = document.getElementById('stake-rooms-list');
    if (!listContainer) {
        console.error("ስህተት: 'stake-rooms-list' የሚለው ቦታ በ HTML ላይ አልተገኘም!");
        return;
    }

    listContainer.innerHTML = ''; // የቆየውን አጽዳ

    STAKES.forEach(amount => {
        const row = document.createElement('div');
        row.className = 'stake-card'; // በ CSSህ መሰረት ቀይረው (ለምሳሌ stake-row)
        row.style = "background: #2a2a2a; margin: 10px; padding: 15px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border-left: 5px solid #f59e0b; cursor: pointer;";
        
        row.onclick = () => selectStake(amount);
        
        row.innerHTML = `
            <div class="stake-info">
                <div style="font-weight: bold; color: white; font-size: 1.2rem;">${amount} ETB</div>
                <div style="color: #aaa; font-size: 0.9rem;" id="stake-count-${amount}">0 Players</div>
            </div>
            <div class="stake-action">
                <button style="background: #f59e0b; color: black; border: none; padding: 8px 15px; border-radius: 5px; font-weight: bold;">ቀላቀል</button>
            </div>
        `;
        listContainer.appendChild(row);
    });
}

// 3. ሩም ሲመረጥ የሚሆን ነገር
function selectStake(amount) {
    console.log("የተመረጠው ሩም: " + amount + " ETB");
    document.getElementById('stake-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    document.getElementById('bet-amount').innerText = amount;
    // እዚህ ጋር ወደ ሰርቨር የሚላክ ኮድ ይጨመራል...
}

// 4. ገጹ ሲከፈት በቅድሚያ የሚሰሩ ስራዎች
document.addEventListener('DOMContentLoaded', () => {
    // ሩሞቹን ወዲያውኑ ሳል
    renderStakeRooms();

    // የሎጊን ሙከራ (ለሙከራ ያህል)
    document.getElementById('do-login').addEventListener('click', () => {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('stake-username').innerText = "Player1";
        renderStakeRooms(); // ዳታው መኖሩን ለማረጋገጥ ደግመህ ጥራው
    });
});

// ስክሪን ለመቀየር የሚረዳ ፋንክሽን
function showAuth(type) {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
}
