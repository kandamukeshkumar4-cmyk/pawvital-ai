import { Quote } from "lucide-react";

export default function StorySection() {
  return (
    <section className="py-24 bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            &quot;He Didn&apos;t Get Up When I Came Home&quot;
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            The moment that changed everything for Cooper and me.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12 border border-gray-200">
          <Quote className="w-10 h-10 text-blue-300 mb-6" />

          <div className="prose prose-lg max-w-none text-gray-700 space-y-4">
            <p>
              For nine years, Cooper had met me at the door. Every single day, without fail.
              I&apos;d hear his nails on the hardwood before I even got my key in the lock. Tail going,
              whole body wiggling, that ridiculous golden retriever smile that made every bad day disappear.
            </p>
            <p>
              But that Tuesday, I walked in and the house was quiet.
            </p>
            <p>
              I found him on his bed in the living room. He looked up at me — just his eyes moved,
              not his head — and I watched his tail give one weak thump against the cushion. Like he
              wanted to greet me but his body just... wouldn&apos;t cooperate.
            </p>
            <p>
              I did what I&apos;d been doing more and more often lately. I Googled it.
              <em>&quot;Dog not getting up. Dog lethargic. Is my dog dying.&quot;</em>
            </p>
            <p>
              And Google gave me fourteen different answers ranging from &quot;he&apos;s just tired&quot; to
              &quot;get to an emergency vet immediately or your dog will die tonight.&quot;
            </p>
            <p className="text-gray-500 italic">
              The emergency vet visit cost $847 and found... nothing.
            </p>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <div className="bg-blue-50 rounded-xl p-6">
              <p className="text-blue-800 font-medium text-lg">
                Then a friend told me about an AI wellness tool that changed everything.
              </p>
              <p className="mt-3 text-blue-700">
                Within three weeks, Cooper was standing up easier. Within two months, he was greeting
                me at the door again. Not like he used to. But enough. <strong>More than enough.</strong>
              </p>
              <p className="mt-3 text-blue-600 text-sm">
                The vet said, &quot;Whatever you&apos;re doing, keep doing it.&quot; — and it cost less than $10 a month.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
