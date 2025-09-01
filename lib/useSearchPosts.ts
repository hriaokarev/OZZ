import {
	Firestore,
	collection,
	query,
	orderBy,
	limit,
	getDocs,
	getDoc,
	doc,
} from "firebase/firestore";

export type SearchPost = {
	id: string;
	content: string;
	userId: string;
	userName: string; // users/{uid}.name が無ければ "anonymous"
	createdAt: Date;
};

function toJsDate(input: any): Date {
	if (input?.toDate && typeof input.toDate === "function") return input.toDate();
	if (input?.seconds != null) return new Date(input.seconds * 1000);
	return new Date();
}

// リアルタイムなし：必要な時に呼び出して取得
export async function fetchSearchPostsOnce(db: Firestore): Promise<SearchPost[]> {
	const q = query(
		collection(db, "searchPosts"),
		orderBy("createdAt", "desc"),
		limit(20)
	);

	const snap = await getDocs(q);
	const items = await Promise.all(
		snap.docs.map(async (d) => {
			const data = d.data() as any;
			const userId: string = data?.userId ?? "anonymous";
			let userName = "anonymous";

			if (userId !== "anonymous") {
				try {
					const uref = doc(db, "users", userId);
					const usnap = await getDoc(uref);
					if (usnap.exists()) {
						const udata = usnap.data() as any;
						userName = udata?.name ?? "anonymous";
					}
				} catch {
					// ユーザー取得失敗時はanonymousのまま
				}
			}

			return {
				id: d.id,
				content: data?.content ?? "",
				userId,
				userName,
				createdAt: toJsDate(data?.createdAt),
			};
		})
	);

	return items;
}
