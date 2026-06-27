const axios = require('axios');
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
  'Democratic Republic of the Congo': 'الكونغو ديمقراطية',
  'Congo DR': 'الكونغو ديمقراطية',
  'New Zealand': 'نيوزيلندا',
  'South Africa': 'جنوب أفريقيا',
  'Qatar': 'قطر',
  'Wales': 'ويلز'
};

// ─── STADIUM TIMEZONE OFFSETS TO MOROCCO TIME (UTC+1 WEST) ─────────────────────
const STADIUM_OFFSETS = {
  '1': { offset: 7, zone: 'توقيت المكسيك' }, 
  '2': { offset: 7, zone: 'توقيت المكسيك' }, 
  '3': { offset: 7, zone: 'توقيت المكسيك' }, 
  '4': { offset: 6, zone: 'توقيت دالاس' }, 
  '5': { offset: 6, zone: 'توقيت هيوستن' }, 
  '6': { offset: 6, zone: 'توقيت كانساس' }, 
  '7': { offset: 5, zone: 'توقيت أتلانتا' }, 
  '8': { offset: 5, zone: 'توقيت ميامي' }, 
  '9': { offset: 5, zone: 'توقيت بوسطن' }, 
  '10': { offset: 5, zone: 'توقيت فيلادلفيا' }, 
  '11': { offset: 5, zone: 'توقيت نيويورك' }, 
  '12': { offset: 5, zone: 'توقيت تورونتو' }, 
  '13': { offset: 8, zone: 'توقيت فانكوفر' }, 
  '14': { offset: 8, zone: 'توقيت سياتل' }, 
  '15': { offset: 8, zone: 'توقيت سان فرانسيسكو' }, 
  '16': { offset: 8, zone: 'توقيت لوس أنجلوس' }
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

// Map english country name to Arabic name and include its flag (Flag first to prevent RTL jumbling)
function getTeamDisplayName(teamName, teamsMap) {
  if (!teamName) return '🏳️ غير معروف';
  
  let flag = '🏳️';
  if (teamsMap) {
    const found = Object.values(teamsMap).find(t => t.name_en.toLowerCase() === teamName.toLowerCase());
    if (found && found.iso2) {
      flag = getFlagEmoji(found.iso2);
    }
  }
  
  const arName = COUNTRY_AR[teamName] || teamName;
  return `${flag} ${arName}`;
}

// Calculate Morocco Time and format both times
function getMatchTimeDisplay(localDateStr, stadiumId) {
  if (!localDateStr) return { local: 'غير محدد', morocco: 'غير محدد' };
  
  const parts = localDateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!parts) return { local: localDateStr, morocco: localDateStr };
  
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const year = parseInt(parts[3], 10);
  const hour = parseInt(parts[4], 10);
  const minute = parseInt(parts[5], 10);
  
  const localDate = new Date(Date.UTC(year, month, day, hour, minute));
  const info = STADIUM_OFFSETS[stadiumId] || { offset: 5, zone: 'توقيت أمريكا' };
  
  const moroccoDate = new Date(localDate.getTime() + (info.offset * 60 * 60 * 1000));
  
  const localTimeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  
  const morMonth = String(moroccoDate.getUTCMonth() + 1).padStart(2, '0');
  const morDay = String(moroccoDate.getUTCDate()).padStart(2, '0');
  const morDateFormatted = `${morMonth}/${morDay}`;
  const morTimeFormatted = `${String(moroccoDate.getUTCHours()).padStart(2, '0')}:${String(moroccoDate.getUTCMinutes()).padStart(2, '0')}`;
  
  return {
    local: `${localTimeFormatted} (${info.zone})`,
    morocco: `${morTimeFormatted} 🇲🇦 (${morDateFormatted})`
  };
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

  let loadingMsg;
  try {
    loadingMsg = await sock.sendMessage(chatId, { text: '⏳ جاري جلب بيانات كأس العالم 2026 مباشرة...' }, { quoted: msg });
  } catch (_) {}

  try {
    const teamsMap = await getTeamsMap();
    const stadiumsMap = await getStadiumsMap();

    const gamesRes = await axios.get('https://worldcup26.ir/get/games', { timeout: 10000 });
    if (!gamesRes.data || !gamesRes.data.games) {
      throw new Error('لم يتم العثور على مباريات في قاعدة البيانات.');
    }
    const games = gamesRes.data.games;

    let responseText = '';

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: LIVE (النتائج المباشرة)
    // ──────────────────────────────────────────────────────────────────────────
    if (sub === 'live' || sub === 'مباشر') {
      const liveMatches = games.filter(g => 
        g.finished.toUpperCase() === 'FALSE' && 
        g.time_elapsed.toLowerCase() !== 'notstarted'
      );

      if (liveMatches.length > 0) {
        responseText = `🏆 كأس العالم 2026 - النتائج المباشرة 🔴\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
        liveMatches.forEach(g => {
          const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
          const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
          const time = g.time_elapsed === 'live' ? 'شغال حالياً' : g.time_elapsed;
          const stadium = stadiumsMap && stadiumsMap[g.stadium_id] ? `🏟️ ${stadiumsMap[g.stadium_id].name_en} (${stadiumsMap[g.stadium_id].city_en})` : '';
          const times = getMatchTimeDisplay(g.local_date, g.stadium_id);

          responseText += `⚽ ${getStageNameAr(g.type)} (المجموعة ${g.group || ''})\n`;
          responseText += `⏱️ حالة المباراة: ${time}\n`;
          responseText += `🏁 ${home}  ${g.home_score} - ${g.away_score}  ${away}\n`;
          responseText += `🇲🇦 توقيت المغرب: ${times.morocco}\n`;
          responseText += `📍 التوقيت المحلي: ${times.local}\n`;
          
          if (g.home_scorers && g.home_scorers !== 'null') {
            try {
              const scorers = JSON.parse(g.home_scorers);
              if (Array.isArray(scorers) && scorers.length > 0) {
                responseText += `⚽ هدافي البداية: ${scorers.join(', ')}\n`;
              }
            } catch (_) {}
          }
          if (g.away_scorers && g.away_scorers !== 'null') {
            try {
              const scorers = JSON.parse(g.away_scorers);
              if (Array.isArray(scorers) && scorers.length > 0) {
                responseText += `⚽ هدافي الخصم: ${scorers.join(', ')}\n`;
              }
            } catch (_) {}
          }
          if (stadium) responseText += `📍 الملعب: ${stadium}\n`;
          responseText += `\n─────────────────────\n`;
        });
      } else {
        const todayStr = '06/27'; 
        const todayMatches = games.filter(g => g.local_date.startsWith(todayStr));

        responseText = `🏆 كأس العالم 2026 - لا توجد مباريات جارية حالياً ⏸️\n━━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (todayMatches.length > 0) {
          responseText += `📅 جدول مباريات اليوم:\n\n`;
          todayMatches.forEach(g => {
            const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
            const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
            const times = getMatchTimeDisplay(g.local_date, g.stadium_id);
            const stadium = stadiumsMap && stadiumsMap[g.stadium_id] ? `${stadiumsMap[g.stadium_id].city_en}` : '';

            responseText += `📌 ${getStageNameAr(g.type)} (المجموعة ${g.group || ''})\n`;
            responseText += `⚔️ ${home} vs ${away}\n`;
            responseText += `🇲🇦 توقيت المغرب: ${times.morocco}\n`;
            responseText += `📍 التوقيت المحلي: ${times.local} | ${stadium}\n\n`;
          });
        } else {
          const upcoming = games
            .filter(g => g.finished.toUpperCase() === 'FALSE' && g.time_elapsed.toLowerCase() === 'notstarted')
            .slice(0, 5);

          if (upcoming.length > 0) {
            responseText += `📅 المباريات القادمة:\n\n`;
            upcoming.forEach(g => {
              const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
              const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
              const times = getMatchTimeDisplay(g.local_date, g.stadium_id);
              
              responseText += `🔹 ${getStageNameAr(g.type)} (المجموعة ${g.group || ''})\n`;
              responseText += `⚔️ ${home} vs ${away}\n`;
              responseText += `🇲🇦 توقيت المغرب: ${times.morocco}\n`;
              responseText += `📍 التوقيت المحلي: ${times.local}\n\n`;
            });
          }
        }
        responseText += `💡 جرب:\n• .wc schedule (جدول المباريات)\n• .wc groups (ترتيب المجموعات)\n• .wc team <البلد> (بحث عن منتخب)`;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: SCHEDULE (جدول المباريات والتوقيت)
    // ──────────────────────────────────────────────────────────────────────────
    else if (sub === 'schedule' || sub === 'matches' || sub === 'جدول' || sub === 'توقيت') {
      const notstarted = games.filter(g => g.finished.toUpperCase() === 'FALSE').slice(0, 10);
      
      responseText = `📅 جدول مباريات كأس العالم 2026 القادمة 🏆\n━━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (notstarted.length > 0) {
        notstarted.forEach(g => {
          const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
          const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
          const times = getMatchTimeDisplay(g.local_date, g.stadium_id);
          const stadium = stadiumsMap && stadiumsMap[g.stadium_id] ? `${stadiumsMap[g.stadium_id].name_en}` : '';

          responseText += `⚽ ${getStageNameAr(g.type)} | المجموعة ${g.group || ''}\n`;
          responseText += `⚔️ ${home} vs ${away}\n`;
          responseText += `🇲🇦 توقيت المغرب: ${times.morocco}\n`;
          responseText += `📍 التوقيت المحلي: ${times.local}\n`;
          if (stadium) responseText += `🏟️ الملعب: ${stadium}\n`;
          responseText += `\n─────────────────────\n`;
        });
      } else {
        responseText += `❌ لم يتم العثور على مباريات قادمة.`;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: GROUPS / STANDINGS (ترتيب المجموعات - موبايل كلين)
    // ──────────────────────────────────────────────────────────────────────────
    else if (sub === 'groups' || sub === 'table' || sub === 'ترتيب' || sub === 'مجموعات') {
      const groupsRes = await axios.get('https://worldcup26.ir/get/groups', { timeout: 10000 });
      if (groupsRes.data && groupsRes.data.groups) {
        responseText = `🏆 ترتيب مجموعات كأس العالم 2026 📊\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        groupsRes.data.groups.forEach(g => {
          responseText += `👑 المجموعة ${g.name}:\n`;
          
          g.teams.forEach((t, idx) => {
            let teamName = `منتخب ${t.team_id}`;
            if (teamsMap && teamsMap[t.team_id]) {
              teamName = getTeamDisplayName(teamsMap[t.team_id].name_en, teamsMap);
            }
            // Mobile-optimized, RTL jumble-free clean line layout
            responseText += `${idx + 1}. ${teamName} ◄ ${t.pts} نقاط (لعب: ${t.mp})\n`;
          });
          responseText += `\n─────────────────────\n`;
        });
      } else {
        throw new Error('فشل جلب ترتيب المجموعات.');
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: SEARCH TEAM (البحث عن منتخب)
    // ──────────────────────────────────────────────────────────────────────────
    else if (sub === 'team' || sub === 'منتخب') {
      const queryTeam = args.slice(1).join(' ').trim();
      if (!queryTeam) {
        responseText = `⚠️ يرجى كتابة اسم المنتخب المراد البحث عنه!\n📌 مثال: .wc team Morocco أو .wc team المغرب`;
      } else {
        let searchName = queryTeam.toLowerCase();
        for (const [eng, ar] of Object.entries(COUNTRY_AR)) {
          if (ar.toLowerCase() === searchName || eng.toLowerCase() === searchName) {
            searchName = eng.toLowerCase();
            break;
          }
        }

        const teamMatches = games.filter(g => 
          (g.home_team_name_en && g.home_team_name_en.toLowerCase().includes(searchName)) || 
          (g.away_team_name_en && g.away_team_name_en.toLowerCase().includes(searchName))
        );

        if (teamMatches.length > 0) {
          const firstMatch = teamMatches[0];
          const hasHomeName = firstMatch.home_team_name_en && firstMatch.home_team_name_en.toLowerCase().includes(searchName);
          const officialName = hasHomeName ? firstMatch.home_team_name_en : firstMatch.away_team_name_en;

          responseText = `🇲🇦 مباريات ونتائج منتخب ${getTeamDisplayName(officialName, teamsMap)} 🏆\n━━━━━━━━━━━━━━━━━━━━━\n\n`;

          teamMatches.forEach(g => {
            const home = getTeamDisplayName(g.home_team_name_en, teamsMap);
            const away = getTeamDisplayName(g.away_team_name_en, teamsMap);
            const times = getMatchTimeDisplay(g.local_date, g.stadium_id);
            const time = g.time_elapsed.toLowerCase() === 'finished' 
              ? 'انتهت' 
              : (g.time_elapsed.toLowerCase() === 'notstarted' ? 'لم تبدأ' : 'شغالة حالياً');

            responseText += `⚽ ${getStageNameAr(g.type)} (المجموعة ${g.group || ''})\n`;
            if (g.finished.toUpperCase() === 'TRUE') {
              responseText += `🏁 النتيجة: ${home} ${g.home_score} - ${g.away_score} ${away} (انتهت ✅)\n`;
            } else {
              responseText += `⚔️ ${home} vs ${away}\n`;
              responseText += `🇲🇦 توقيت المغرب: ${times.morocco}\n`;
              responseText += `📍 التوقيت المحلي: ${times.local} (${time})\n`;
            }
            responseText += `\n─────────────────────\n`;
          });
        } else {
          responseText = `❌ لم يتم العثور على مباريات لمنتخب "${queryTeam}". تأكد من كتابة الاسم بشكل صحيح (مثال: المغرب / Morocco).`;
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUB-COMMAND: STADIUMS (الملاعب والمدن)
    // ──────────────────────────────────────────────────────────────────────────
    else if (sub === 'stadiums' || sub === 'stadium' || sub === 'ملاعب' || sub === 'مدن') {
      const stadiumsRes = await axios.get('https://worldcup26.ir/get/stadiums', { timeout: 10000 });
      if (stadiumsRes.data && stadiumsRes.data.stadiums) {
        responseText = `🏟️ الملاعب والمدن المستضيفة لكأس العالم 2026 🇺🇸🇲🇽🇨🇦\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
        stadiumsRes.data.stadiums.forEach(s => {
          let flag = '🇺🇸';
          if (s.country_en.toLowerCase() === 'mexico') flag = '🇲🇽';
          if (s.country_en.toLowerCase() === 'canada') flag = '🇨🇦';
          
          responseText += `📍 ${s.name_en} | ${flag}\n`;
          responseText += `🏙️ المدينة: ${s.city_en} | السعة: ${s.capacity.toLocaleString()} مشجع\n`;
          responseText += `🌍 الدولة: ${s.country_en} (${s.region})\n\n`;
        });
      } else {
        throw new Error('فشل جلب معلومات الملاعب.');
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // DEFAULT: HELP
    // ──────────────────────────────────────────────────────────────────────────
    else {
      responseText = `🏆 كأس العالم 2026 (FIFA World Cup) 🏆\n━━━━━━━━━━━━━━━━━━━━━\n\n` +
                   `قائمة الخيارات المتاحة:\n` +
                   `🔴 .wc live — النتائج المباشرة للمباريات الجارية حالياً.\n` +
                   `📅 .wc schedule — جدول المباريات القادمة بالتوقيت.\n` +
                   `📊 .wc table — ترتيب المجموعات ونقاط المنتخبات.\n` +
                   `🇲🇦 .wc team <البلد> — البحث عن نتائج منتخب معين.\n` +
                   `🏟️ .wc stadiums — قائمة الملاعب والمدن المستضيفة.\n\n` +
                   `⚔️ ${settings.botName}`;
    }

    await sock.sendMessage(chatId, { text: responseText }, { quoted: msg });

  } catch (err) {
    console.error('[WC Command Error]:', err.message);
    const errorText = `❌ فشل جلب بيانات كأس العالم 2026\n\nالسبب: ${err.message || 'مشكلة في الاتصال بالخادم.'}`;
    await sock.sendMessage(chatId, { text: errorText }, { quoted: msg });
  }
};
