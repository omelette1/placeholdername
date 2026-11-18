import {test,expect} from '../../apps/dashboard/node_modules/@playwright/test';
test('confirm, compare, inspect evidence, rerun, reload history',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Code change'})).toBeVisible();
  await expect(page.getByText('“Removed collaborators cannot retrieve private documents.”',{exact:true})).toBeVisible();
  const confirm=page.getByRole('checkbox');
  if(await confirm.count()){
    await expect(page.getByRole('button',{name:'Run comparison'})).toBeDisabled();
    await confirm.check();
    await page.getByRole('button',{name:'Save rule'}).click();
    await expect(page.getByText('✓ Rule saved',{exact:false})).toBeVisible();
  }
  await page.getByRole('button',{name:/Run comparison|Rerun saved test/}).click();
  await expect(page.getByText('PASS',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByText('FAIL',{exact:true})).toBeVisible();
  await expect(page.getByText('Private content matched: yes')).toHaveCount(5);
  await expect(page.getByText('Suspected cause',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Rerun saved test ↗'}).click();
  await expect(page.getByRole('button',{name:'Rerun saved test ↗'})).toBeEnabled({timeout:30000});
  await page.reload();
  await expect(page.getByText('PASS',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/review.png',fullPage:true});
});
