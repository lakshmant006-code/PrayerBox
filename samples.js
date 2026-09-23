// Demo letters: a random batch of sample prayers so the box looks lived-in.
// One batch is made per browser session (tab) and reused until the tab closes;
// if a bigger screen needs more letters, extra ones are added to the batch.
// Remove this file (and its <script> tag in box.html) to show only real prayers.
var SamplePrayers = (function () {
  var KEY = 'samplePrayers';

  var NAMES = [
    'Grace', 'Daniel', 'Maria', 'Joshua', 'Priya', 'Samuel', 'Esther', 'David', 'Ruth', 'Michael',
    'Hannah', 'Joseph', 'Anika', 'Elijah', 'Sarah', 'Matthew', 'Leah', 'Isaac', 'Naomi', 'Caleb',
    'Abigail', 'Arjun', 'Chloe', 'Nathan', 'Lydia', 'Gabriel', 'Mei', 'Jonah', 'Tabitha', 'Ravi',
    'Olivia', 'Aaron', 'Sofia', 'Benjamin', 'Deborah', 'Kwame', 'Anna', 'Luke', 'Miriam', 'Tomas'
  ];

  var REQUESTS = [
    'Please pray for my grandmother who is undergoing surgery tomorrow morning. Praying for peace for our family and a swift, steady recovery.',
    'I start a new job on Monday. Praying for courage, patience, and kind coworkers.',
    'My dad was just diagnosed with diabetes. Please pray for strength as he changes his habits.',
    'Pray for my sister and her husband as they wait to adopt. The waiting is hard.',
    'I have my final exams next week. Asking for focus, calm, and a clear mind.',
    'Please pray for our friends who lost their home in the flood. They need shelter and hope.',
    'Grateful today. My mom finished her last round of chemo. Thank you for praying with us.',
    'Praying for my marriage. We have been distant lately and want to find our way back.',
    'Please pray for my son who is struggling with anxiety at school.',
    'My best friend is moving across the country. Pray that we stay close.',
    'Asking for prayers for a safe delivery. Our baby is due any day now.',
    'Pray for wisdom as I decide whether to go back to school.',
    'Please remember my uncle who passed away last week, and comfort my aunt and cousins.',
    'I have been out of work for three months. Praying for the right door to open.',
    'Pray for peace in my neighborhood. There has been a lot of tension lately.',
    'My daughter is travelling abroad for the first time. Praying for her safety.',
    'Thankful for a clean scan today. Please keep praying for full healing.',
    'Please pray for my recovery from surgery and patience with the slow days.',
    'Pray for our church as we look for a new pastor.',
    'I am trying to forgive someone who hurt me deeply. Please pray for a softer heart.',
    'Pray for my grandfather, who is lonely since grandma passed.',
    'Asking for prayers for my mental health. Some days are really heavy.',
    'Pray for the students and teachers at our school as the new year begins.',
    'My brother is in rehab. Please pray he stays strong and knows he is loved.',
    'Please pray for rain for the farmers in our town.',
    'Praying for a friend waiting on biopsy results this week.',
    'Pray that I can be a patient and gentle parent.',
    'Please pray for my team at work. We are all exhausted and stretched thin.',
    'Thank you, God, for bringing our family together this weekend.',
    'Pray for healing for my mother\'s back so she can walk without pain.'
  ];

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function generate(count) {
    var now = Date.now();
    var week = 7 * 24 * 60 * 60 * 1000;
    var samples = [];
    for (var i = 0; i < count; i++) {
      var anonymous = Math.random() < 0.2;
      samples.push({
        name: anonymous ? 'Anonymous' : pick(NAMES),
        request: pick(REQUESTS),
        visibility: anonymous ? 'anonymous' : 'public',
        createdAt: new Date(now - Math.random() * week).toISOString(),
        sample: true
      });
    }
    // Newest first, like real prayers.
    return samples.sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; });
  }

  return {
    // Returns `count` sample letters for this session.
    get: function (count) {
      var saved = [];
      try { saved = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) {}
      if (saved.length < count) {
        saved = saved.concat(generate(count - saved.length));
        try { sessionStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {}
      }
      return saved.slice(0, count);
    }
  };
})();
