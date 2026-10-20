import concurrent.futures
import json
import os
import sqlite3
import tempfile
import threading

def race(initial_busy, initial_owner, recovery=False):
    with tempfile.TemporaryDirectory() as directory:
        path=os.path.join(directory,'isolated-lock.sqlite')
        con=sqlite3.connect(path)
        con.execute('CREATE TABLE worker_lock (id INTEGER PRIMARY KEY, busy INTEGER NOT NULL, owner TEXT NOT NULL)')
        con.execute('INSERT INTO worker_lock VALUES (1, ?, ?)',(initial_busy,initial_owner))
        con.commit()
        con.close()
        gate=threading.Barrier(32)
        def claim(index):
            db=sqlite3.connect(path,timeout=30)
            gate.wait()
            # Same conditional UPDATE predicates as the inspected installed n8n repository.
            if recovery:
                changed=db.execute('UPDATE worker_lock SET busy=1, owner=? WHERE id=1 AND busy=1 AND owner=?',(str(index),'344')).rowcount
            else:
                changed=db.execute('UPDATE worker_lock SET busy=1, owner=? WHERE id=1 AND busy=0',(str(index),)).rowcount
            db.commit()
            db.close()
            return changed
        with concurrent.futures.ThreadPoolExecutor(max_workers=32) as pool:
            winners=sum(pool.map(claim,range(32)))
        assert winners==1, winners
        return {'contenders':32,'winners':winners,'passed':True}

report={'kind':'isolated SQLite conditional UPDATE concurrency; production database untouched','worker':race(0,''),'recovery':race(1,'344',True)}
with open('tests/lock-results.json','w',encoding='utf-8') as file:
    json.dump(report,file,indent=2)
print(json.dumps(report))
