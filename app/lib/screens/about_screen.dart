import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('সম্পর্কে')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Icon(Icons.warning_amber_rounded, color: AppColors.amber, size: 48),
          const SizedBox(height: 12),
          const Text(
            'PotholeAlertBD',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          const Text(
            '"একটি গর্ত শুধুই একটি অভিযোগ। কিন্তু হাজারো রিপোর্ট একসাথে দেখায় পুরো রাস্তার প্রকৃত অবস্থা।"',
            style: TextStyle(color: AppColors.textMuted, fontStyle: FontStyle.italic),
          ),
          const SizedBox(height: 20),
          const _Section(
            title: 'এই অ্যাপ কী করে',
            body:
                'যেকোনো নাগরিক রাস্তার গর্তের ছবি তুলে ও অবস্থান শেয়ার করে সহজেই রিপোর্ট জমা দিতে পারেন — '
                'নাম-পরিচয় ছাড়াই। প্রতিটি রিপোর্ট রাস্তার ধরন অনুযায়ী সংশ্লিষ্ট কর্তৃপক্ষের কাছে (যেমন সড়ক ও জনপথ '
                'অধিদপ্তর, সিটি কর্পোরেশন/পৌরসভা, বা স্থানীয় সরকার প্রকৌশল অধিদপ্তর) পাঠানোর জন্য চিহ্নিত করা হয়, '
                'এবং মানচিত্র ও পরিসংখ্যানে প্রকাশ করা হয় যাতে সবাই সমস্যার ব্যাপ্তি দেখতে পারেন।',
          ),
          const _Section(
            title: 'গোপনীয়তা',
            body:
                'রিপোর্ট জমা দিতে কোনো অ্যাকাউন্ট বা লগইনের প্রয়োজন নেই। নাম ও ফোন নম্বর সম্পূর্ণ ঐচ্ছিক এবং '
                'জনসমক্ষে প্রকাশ করা হয় না — শুধু প্রয়োজনে কর্তৃপক্ষের অনুসরণের জন্য রাখা হতে পারে। নাম বা ফোন দিলে জমার পর '
                'একটি এককালীন মুছে ফেলার কোড দেখানো হয়; তা দিয়ে নাম ও ফোন মুছে ফেলা যায় (বিস্তারিত গোপনীয়তা নীতিতে)।',
          ),
          const _Section(
            title: 'গুরুত্বপূর্ণ দাবিত্যাগ',
            body:
                'এই অ্যাপটি কোনো সরকারি সংস্থার আনুষ্ঠানিক অভিযোগ ব্যবস্থা নয়। এটি নাগরিকদের রাস্তার সমস্যা '
                'সহজে জানানো ও সচেতনতা বৃদ্ধির একটি স্বাধীন উদ্যোগ। জরুরি নিরাপত্তা ঝুঁকির ক্ষেত্রে সরাসরি স্থানীয় '
                'প্রশাসন বা জরুরি সেবায় (৯৯৯) যোগাযোগ করুন।',
          ),
          const SizedBox(height: 8),
          const Text(
            'ghush.site থেকে অনুপ্রাণিত — স্বচ্ছতা ও সম্মিলিত তথ্যের মাধ্যমে ব্যবস্থার উন্নতির চেষ্টা।',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String body;
  const _Section({required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 6),
          Text(body, style: const TextStyle(color: AppColors.textPrimary, height: 1.5)),
        ],
      ),
    );
  }
}
