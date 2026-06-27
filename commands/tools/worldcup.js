const axios = require('axios');
const chalk = require('chalk');
const settings = require('../../config');

// ─── CACHE FOR TEAM DATA ───────────────────────────────────────────────────────
let teamsCache = null;
let stadiumsCache = null;

// ─── TRANSLATION DICTIONARY FOR COUNTRIES ──────────────────────────────────────
const COUNTRY_AR = {
  'Mexico': 'المكسيك',
  'United States': 'الولايات المتحدة',
  'Canada': 'كندا',
  'Argentina': 'الأرجنتين',
  'Brazil': 'البرازيل',
  'France': 'فرنسا',
  'England': 'إنجلترا',
  'Spain': 'إسبانيا',
  'Portugal': 'البرتغال',
  'Morocco': 'المغرب',
  'Germany': 'ألمانيا',
  'Italy': 'إيطاليا',
  'Belgium': 'بلجيكا',
  'Netherlands': 'هولندا',
  'Croatia': 'كرواتيا',
  'Uruguay': 'أوروغواي',
  'Senegal': 'السنغال',
  'Japan': 'اليابان',
  'South Korea': 'كوريا الجنوبية',
  'Australia': 'أستراليا',
  'Saudi Arabia': 'السعودية',
  'Egypt': 'مصر',
  'Tunisia': 'تونس',
  'Algeria': 'الجزائر',
  'Cameroon': 'الكاميرون',
  'Ghana': 'غانا',
  'Switzerland': 'سويسرا',
  'Denmark': 'الدنمارك',
  'Sweden': 'السويد',
  'Poland': 'بولندا',
  'Colombia': 'كولومبيا',
  'Chile': 'تشيلي',
  'Ecuador': 'الإكوادور',
  'Peru': 'بيرو',
  'Nigeria': 'نيجيريا',
  'Ivory Coast': 'ساحل العاج',
  'Iran': 'إيران',
  'Iraq': 'العراق',
  'Jordan': 'الأردن',
  'Uzbekistan': 'أوزبكستان',
  'Turkey': 'تركيا',
  'Ukraine': 'أوكرانيا',
  'Austria': 'النمسا',
  'Panama': 'بنما',
  'Democratic Republic of the Congo': 'الكونغو الديمقراطية',
  'Congo DR': 'الكونغو الديمقراطية',
  'New Zealand': 'نيوزيلندا',
  'South Africa': 'جنوب أفريقيا',
  'Qatar': 'قطر',
  'Wales': 'ويلز'
};

// Convert ISO2 code to country flag emoji
function getFlagEmoji(iso2) {
  if (!iso2) return '🏳️';
  try {
    return iso2.toUpperCase().replace(/./g, char => 
      String.fromCodePoint(char.charCodeAt(0) + 127397)
    );
  } catch (e) {
    return '🏳️';
  }
}

// Map english country name to Arabic name and include its flag
function getTeamDisplayName(teamName, teamsMap) {
  if (!teamName) return 'غير معروف 🏳️';
  
  // Find team in cache to get ISO2 flag code
  let flag = '🏳️';
  if (teamsMap) {
    // Try search by name_en (case insensitive)
    const found = Object.values(teamsMap).find(t => t.name_en.toLowerCase() === teamName.toLowerCase());
    if (found && found.iso2) {
      flag = getFlagEmoji(found.iso2);
    }
  }
  
  const arName = COUNTRY_AR[teamName] || teamName;
  return `${arName} ${flag}`;
}

// Translate match stage/type
function getStageNameAr(type) {
  const stages = {
    'group': 'دور المجموعات',
    'round of 32': 'دور الـ 32',
    'round of 16': 'دور الـ 16',
    'quarterfinals': 'ربع النهائي',
    'semifinals': 'نصف النهائي',
    'thirdplace': 'مباراة المركز الثالث',
    'final': 'النهائي'
  };
  return stages[type.toLowerCase()] || type;
}

// ─── API FETCHERS ─────────────────────────────────────────────────────────────
async function getTeamsMap() {
  if (teamsCache) return teamsCache;
  try {
    const res = await axios.get('https://worldcup26.ir/get/teams', { timeout: 10000 });
    if (res.data && res.data.teams) {
      const map = {};
      res.data.teams.forEach(t => {
        map[t.id] = t;
      });
      teamsCache = map;
      return teamsCache;
    }
  } catch (e) {
    console.error('[WC API Error - Teams]:', e.message);
  }
  return null;
}

async function getStadiumsMap() {
  if (stadiumsCache) return stadiumsCache;
  try {
    const res = await axios.get('https://worldcup26.ir/get/stadiums', { timeout: 10000 });
    if (res.data && res.data.stadiums) {
      const map = {};
      res.data.stadiums.forEach(s => {
        map[s.id] = s;
      });
      stadiumsCache = map;
      return stadiumsCache;
    }
  } catch (e) {
    console.error('[WC API Error - Stadiums]:', e.message);
  }
  return null;
}

// ─── MAIN EXPORT ────────────────────────────────────────────────────────────────
module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
  const isTelegram = helpers && helpers.isTelegram;
  const isFacebook = helpers && helpers.isFacebook;

  const sub = args[0] ? args[0].toLowerCase() : 'live';

  // Inform user that we are fetching live World Cup data
  let loadingMsg;
  try {
    loadingMsg = await sock.sendMessage(chatId, { text: '⏳ *جاري جلب بيانات كأس العالم 2026 مباشرة...*' }, { quoted: msg });
  } catch (_) {}

  try {
    // 1. Load basic maps
    const teamsMap = await getTeamsMap();
    const stadiumsMap = await getStadiumsMap();

    // 2. Fetch matches/games
    const gamesRes = await axios.get('https://worldcup26.ir/get/games', { timeout: 10000 });
    if (!gamesRes.data || !gamesRes.data.games) {
      throw new Error('لم يتم العثور على مباريات في قاعدة البيانات.');
    }
    const games = gamesRes.data.games;

    let responseText = '';

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: LIVE (أو النتيجة المباشرة en direct)
    // ──────────────────────────────────────────────────────────────────────────
    if (sub === 'live' || sub === 'مباشر') {
      // Find live matches: finished is FALSE and time_elapsed is not 'notstarted'
      const liveMatches = games.filter(g => 
        g.finished.toUpperCase() === 'FALSE' && 
        g.time_elapsed.toLowerCase() !== 'notstarted'
      );

      if (liveMatches.length > 0) {
        responseText = `🏆 *كأس العالم 2026 - النتائج المباشرة 🔴*
━━━━━━━━━━━━━━━━━━━━━\n\n`;
        liveMatches.forEach(g => {
          const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
          const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
          const time = g.time_elapsed === 'live' ? 'شغال حالياً' : g.time_elapsed;
          const stadium = stadiumsMap && stadiumsMap[g.stadium_id] ? `🏟️ ${stadiumsMap[g.stadium_id].name_en} (${stadiumsMap[g.stadium_id].city_en})` : '';

          responseText += `⚽ *${getStageNameAr(g.type)} (المجموعة ${g.group || ''})*\n`;
          responseText += `⏱️ *الوقت:* ${time}\n`;
          responseText += `🏁 *المباراة:* ${home}  *${g.home_score} - ${g.away_score}*  ${away}\n`;
          
          if (g.home_scorers && g.home_scorers !== 'null') {
            try {
              const scorers = JSON.parse(g.home_scorers);
              if (Array.isArray(scorers) && scorers.length > 0) {
                responseText += ` ⚽ هدافي ${g.home_team_name_en}: ${scorers.join(', ')}\n`;
              }
            } catch (_) {}
          }
          if (g.away_scorers && g.away_scorers !== 'null') {
            try {
              const scorers = JSON.parse(g.away_scorers);
              if (Array.isArray(scorers) && scorers.length > 0) {
                responseText += ` ⚽ هدافي ${g.away_team_name_en}: ${scorers.join(', ')}\n`;
              }
            } catch (_) {}
          }
          if (stadium) responseText += `${stadium}\n`;
          responseText += `\n─────────────────────\n`;
        });
      } else {
        // No live matches, show today's schedule or next matches
        // Current simulation date is June 27, 2026
        const todayStr = '06/27'; 
        const todayMatches = games.filter(g => g.local_date.startsWith(todayStr));

        responseText = `🏆 *كأس العالم 2026 - لا توجد مباريات جارية حالياً* ⏸️
━━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (todayMatches.length > 0) {
          responseText += `📅 *جدول مباريات اليوم (${new Date().toLocaleDateString('ar-MA')}):*\n\n`;
          todayMatches.forEach(g => {
            const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
            const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
            const timeOnly = g.local_date.split(' ')[1] || '';
            const stadium = stadiumsMap && stadiumsMap[g.stadium_id] ? `📍 ${stadiumsMap[g.stadium_id].city_en}` : '';

            responseText += `📌 *${getStageNameAr(g.type)} (المجموعة ${g.group || ''})*\n`;
            responseText += `⚔️ ${home} *vs* ${away}\n`;
            responseText += `⏰ *التوقيت:* ${timeOnly} (بتوقيت الملعب) | ${stadium}\n\n`;
          });
        } else {
          // If no matches today, get next 5 notstarted matches
          const upcoming = games
            .filter(g => g.finished.toUpperCase() === 'FALSE' && g.time_elapsed.toLowerCase() === 'notstarted')
            .slice(0, 5);

          if (upcoming.length > 0) {
            responseText += `📅 *المباريات القادمة:* \n\n`;
            upcoming.forEach(g => {
              const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
              const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
              
              responseText += `🔹 *${getStageNameAr(g.type)} (المجموعة ${g.group || ''})*\n`;
              responseText += `⚔️ ${home} *vs* ${away}\n`;
              responseText += `📅 *التاريخ:* ${g.local_date}\n\n`;
            });
          }
        }
        responseText += `💡 *جرب:*
• \`.wc schedule\` لمعرفة جدول المباريات.
• \`.wc groups\` لرؤية ترتيب المجموعات.
• \`.wc team <البلد>\` للبحث عن تفاصيل منتخب معين.`;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: SCHEDULE (جدول المباريات والتوقيت)
    // ──────────────────────────────────────────────────────────────────────────
    else if (sub === 'schedule' || sub === 'matches' || sub === 'جدول' || sub === 'توقيت') {
      // Group games by date
      const notstarted = games.filter(g => g.finished.toUpperCase() === 'FALSE').slice(0, 10);
      
      responseText = `📅 *جدول مباريات كأس العالم 2026 القادمة* 🏆
━━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (notstarted.length > 0) {
        notstarted.forEach(g => {
          const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
          const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
          const stadium = stadiumsMap && stadiumsMap[g.stadium_id] ? `🏟️ ${stadiumsMap[g.stadium_id].name_en}` : '';

          responseText += `⚽ *${getStageNameAr(g.type)} | المجموعة ${g.group || ''}*\n`;
          responseText += `⚔️ ${home} *vs* ${away}\n`;
          responseText += `📅 *التوقيت:* ${g.local_date}\n`;
          if (stadium) responseText += `${stadium}\n`;
          responseText += `\n─────────────────────\n`;
        });
      } else {
        responseText += `❌ لم يتم العثور على مباريات قادمة غير ملعوبة. ربما انتهى المونديال!`;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: GROUPS / STANDINGS (ترتيب المجموعات ونقاط المنتخبات)
    // ──────────────────────────────────────────────────────────────────────────
    else if (sub === 'groups' || sub === 'table' || sub === 'ترتيب' || sub === 'مجموعات') {
      const groupsRes = await axios.get('https://worldcup26.ir/get/groups', { timeout: 10000 });
      if (groupsRes.data && groupsRes.data.groups) {
        responseText = `🏆 *ترتيب مجموعات كأس العالم 2026* 📊
━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        groupsRes.data.groups.forEach(g => {
          responseText += `👑 *المجموعة ${g.name} (Group ${g.name}):*\n`;
          responseText += `⚙️ _الترتيب | لعب | فوز | تعادل | خسارة | نقاط_\n`;
          
          g.teams.forEach((t, idx) => {
            // Find team name in cached map if available
            let teamName = `Team ${t.team_id}`;
            if (teamsMap && teamsMap[t.team_id]) {
              teamName = getTeamDisplayName(teamsMap[t.team_id].name_en, teamsMap);
            }
            responseText += `${idx + 1}. ${teamName} | *${t.mp}* | ${t.w} | ${t.d} | ${t.l} | *${t.pts} pts*\n`;
          });
          responseText += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
        });
      } else {
        throw new Error('فشل جلب ترتيب المجموعات.');
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: SEARCH TEAM (البحث عن منتخب معين ومبارياته)
    // ──────────────────────────────────────────────────────────────────────────
    else if (sub === 'team' || sub === 'منتخب') {
      const queryTeam = args.slice(1).join(' ').trim();
      if (!queryTeam) {
        responseText = `⚠️ *يرجى كتابة اسم المنتخب المراد البحث عنه!*\n📌 مثال: \`.wc team Morocco\` أو \`.wc team المغرب\``;
      } else {
        // Find country name in english if user typed in Arabic
        let searchName = queryTeam.toLowerCase();
        // Check if there is Arabic name in our dictionary
        for (const [eng, ar] of Object.entries(COUNTRY_AR)) {
          if (ar.toLowerCase() === searchName || eng.toLowerCase() === searchName) {
            searchName = eng.toLowerCase();
            break;
          }
        }

        // Search matches for this team
        const teamMatches = games.filter(g => 
          g.home_team_name_en.toLowerCase().includes(searchName) || 
          g.away_team_name_en.toLowerCase().includes(searchName)
        );

        if (teamMatches.length > 0) {
          const officialName = teamMatches[0].home_team_name_en.toLowerCase().includes(searchName) 
            ? teamMatches[0].home_team_name_en 
            : teamMatches[0].away_team_name_en;

          responseText = `🇲🇦 *نتائج ومباريات منتخب ${getTeamDisplayName(officialName, teamsMap)}* 🏆
━━━━━━━━━━━━━━━━━━━━━\n\n`;

          teamMatches.forEach(g => {
            const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
            const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
            const time = g.time_elapsed.toLowerCase() === 'finished' 
              ? 'انتهت' 
              : (g.time_elapsed.toLowerCase() === 'notstarted' ? 'لم تبدأ' : 'شغالة حالياً');

            responseText += `⚽ *${getStageNameAr(g.type)} (المجموعة ${g.group || ''})*\n`;
            if (g.finished.toUpperCase() === 'TRUE') {
              responseText += `🏁 *النتيجة:* ${home}  *${g.home_score} - ${g.away_score}*  ${away} (انتهت ✅)\n`;
            } else {
              responseText += `⏰ *التوقيت:* ${g.local_date} (${time})\n`;
              responseText += `⚔️ *المباراة:* ${home} vs ${away}\n`;
            }
            responseText += `\n─────────────────────\n`;
          });
        } else {
          responseText = `❌ لم يتم العثور على أي مباريات أو بيانات لمنتخب "${queryTeam}" في كأس العالم 2026. تأكد من كتابة الاسم بشكل صحيح بالإنجليزية أو العربية (مثال: Morocco / المغرب).`;
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: STADIUMS (الملاعب والمدن المستضيفة)
    // ──────────────────────────────────────────────────────────────────────────
    else if (sub === 'stadiums' || sub === 'stadium' || sub === 'ملاعب' || sub === 'مدن') {
      const stadiumsRes = await axios.get('https://worldcup26.ir/get/stadiums', { timeout: 10000 });
      if (stadiumsRes.data && stadiumsRes.data.stadiums) {
        responseText = `🏟️ *الملاعب والمدن المستضيفة لكأس العالم 2026* 🇺🇸🇲🇽🇨🇦
━━━━━━━━━━━━━━━━━━━━━\n\n`;
        stadiumsRes.data.stadiums.forEach(s => {
          let flag = '🇺🇸';
          if (s.country_en.toLowerCase() === 'mexico') flag = '🇲🇽';
          if (s.country_en.toLowerCase() === 'canada') flag = '🇨🇦';
          
          responseText += `📍 *${s.name_en}* | ${flag}\n`;
          responseText += `🏙️ *المدينة:* ${s.city_en} | *السعة:* ${s.capacity.toLocaleString()} مشجع\n`;
          responseText += `🌍 *المنطقة:* ${s.region} (${s.country_en})\n\n`;
        });
      } else {
        throw new Error('فشل جلب معلومات الملاعب.');
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // DEFAULT: HELP / ERROR GESTURE
    // ──────────────────────────────────────────────────────────────────────────
    else {
      responseText = `🏆 *أمر كأس العالم 2026 (FIFA World Cup)* 🏆
━━━━━━━━━━━━━━━━━━━━━

قائمة الخيارات المتاحة:
🔴 \`.wc live\` — النتائج المباشرة للمباريات الجارية حالياً.
📅 \`.wc schedule\` — جدول المباريات القادمة بالتوقيت والتاريخ.
📊 \`.wc table\` — ترتيب المجموعات ونقاط المنتخبات (من أ إلى ل).
🇲🇦 \`.wc team <البلد>\` — البحث عن مباريات ونتائج منتخب معين (مثال: Morocco).
🏟️ \`.wc stadiums\` — قائمة الملاعب والمدن المستضيفة بالولايات المتحدة والمكسيك وكندا.

⚔️ ${settings.botName}`;
    }

    // 3. Send final message
    await sock.sendMessage(chatId, { text: responseText }, { quoted: msg });

  } catch (err) {
    console.error('[WC Command Error]:', err.message);
    const errorText = `❌ *فشل جلب بيانات كأس العالم 2026*\n\nالسبب: ${err.message || 'مشكلة في الاتصال بالخادم.'}\n\nيرجى المحاولة مجدداً لاحقاً.`;
    await sock.sendMessage(chatId, { text: errorText }, { quoted: msg });
  } finally {
    // Clean up loading message if possible
    if (loadingMsg) {
      try {
        // Optional clean up
      } catch (_) {}
    }
  }
};
